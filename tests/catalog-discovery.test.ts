import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  catalogProductUrls,
  CatalogDiscoveryTimeoutError,
  executeCatalogDiscovery,
  PlaywrightCatalogDiscoveryRunner,
} from "@/lib/catalog-discovery";
import { UnsafeUrlError } from "@/lib/url-safety";
import {
  AuthorizationError,
  CatalogDiscoveryDeadlineError,
  WorkspaceService,
} from "@/lib/workspace-service";

const directories: string[] = [];
const resolver = async () => [{ address: "93.184.216.34", family: 4 }];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function createService() {
  const directory = mkdtempSync(path.join(tmpdir(), "pdpguard-catalog-"));
  directories.push(directory);
  const databasePath = path.join(directory, "pdpguard.sqlite");
  return {
    databasePath,
    service: new WorkspaceService(databasePath, resolver),
  };
}

describe("catalog discovery", () => {
  it("classifies only same-origin conventional PDP paths", () => {
    expect(
      catalogProductUrls(
        [
          "https://shop.example/products/shirt",
          "https://shop.example/product/shirt?variant=blue",
          "https://shop.example/p/123",
          "https://shop.example/products",
          "https://shop.example/search?q=shirt",
          "https://shop.example/blog/products/shirt",
          "https://shop.example/account/orders",
          "https://other.example/products/shirt",
          "not a URL",
        ],
        "https://shop.example",
      ),
    ).toEqual([
      "https://shop.example/products/shirt",
      "https://shop.example/product/shirt?variant=blue",
      "https://shop.example/p/123",
    ]);
  });

  it("deduplicates and caps classified PDPs at 200", () => {
    const links = Array.from(
      { length: 250 },
      (_, index) => `https://shop.example/products/${index}`,
    );
    expect(
      catalogProductUrls([...links, links[0]], "https://shop.example"),
    ).toHaveLength(200);
  });

  it("persists exact normalized URLs, deduplicates, and marks missing pages inactive", async () => {
    const { databasePath, service } = createService();
    const session = service.issueSession("owner");
    const principal = service.authenticateSession(session.token);
    const workspace = service.createWorkspace(principal, "Acme");
    const store = await service.createStore(principal, workspace.id, {
      url: "https://example.com",
    });

    service.startCatalogDiscovery(principal, store.id);
    const first = await service.completeCatalogDiscovery(principal, store.id, [
      "https://example.com/products/one#details",
      "https://example.com/products/one#reviews",
      "https://example.com/products/one?variant=blue",
      "https://other.example/products/off-origin",
      "http://localhost/products/private",
    ]);

    expect(first.discovery).toMatchObject({
      status: "succeeded",
      discoveredCount: 2,
      rejectedCount: 2,
    });
    expect(first.items.map((item) => item.normalizedUrl)).toEqual([
      "https://example.com/products/one",
      "https://example.com/products/one?variant=blue",
    ]);
    const original = first.items[0];

    service.startCatalogDiscovery(principal, store.id);
    const refreshed = await service.completeCatalogDiscovery(
      principal,
      store.id,
      ["https://example.com/products/one?variant=blue"],
    );
    expect(refreshed.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: original.id,
          normalizedUrl: original.normalizedUrl,
          firstSeenAt: original.firstSeenAt,
          active: false,
        }),
        expect.objectContaining({
          normalizedUrl: "https://example.com/products/one?variant=blue",
          active: true,
        }),
      ]),
    );

    const outsider = service.authenticateSession(
      service.issueSession("outsider").token,
    );
    expect(() => service.getStoreCatalog(outsider, store.id)).toThrow(
      AuthorizationError,
    );
    service.close();

    const reopened = new WorkspaceService(databasePath, resolver);
    expect(
      reopened.getStoreCatalog(
        reopened.authenticateSession(session.token),
        store.id,
      ),
    ).toMatchObject({
      discovery: { status: "succeeded", discoveredCount: 1 },
      items: [{ active: true }, { active: false }],
    });
    reopened.close();
  });

  it("keeps empty results distinct from failures and preserves catalog on failure", async () => {
    const { service } = createService();
    const principal = service.authenticateSession(
      service.issueSession("owner").token,
    );
    const workspace = service.createWorkspace(principal, "Acme");
    const emptyStore = await service.createStore(principal, workspace.id, {
      url: "https://empty.example",
    });
    const store = await service.createStore(principal, workspace.id, {
      url: "https://example.com",
    });

    const empty = await executeCatalogDiscovery(
      service,
      principal,
      emptyStore.id,
      {
        async discover() {
          return [];
        },
      },
    );
    expect(empty).toMatchObject({
      discovery: { status: "succeeded", discoveredCount: 0 },
      items: [],
    });

    await executeCatalogDiscovery(service, principal, store.id, {
      async discover() {
        return ["https://example.com/products/one"];
      },
    });
    const failed = await executeCatalogDiscovery(service, principal, store.id, {
      async discover() {
        throw new UnsafeUrlError("unsafe redirect");
      },
    });
    expect(failed).toMatchObject({
      discovery: { status: "failed", failureCategory: "unsafe_url" },
      items: [
        { normalizedUrl: "https://example.com/products/one", active: true },
      ],
    });

    const { run } = await service.createAuditRun(
      principal,
      store.id,
      "https://example.com/products/one",
    );
    expect(run.status).toBe("queued");
    service.close();
  });

  it("releases the discovery slot when starting an unauthorized discovery fails", async () => {
    const { service } = createService();
    const principal = service.authenticateSession(
      service.issueSession("owner").token,
    );
    const workspace = service.createWorkspace(principal, "Acme");
    const store = await service.createStore(principal, workspace.id, {
      url: "https://example.com",
    });

    await expect(
      executeCatalogDiscovery(service, principal, "missing-store"),
    ).rejects.toThrow(AuthorizationError);
    await expect(
      executeCatalogDiscovery(service, principal, store.id, {
        async discover() {
          return [];
        },
      }),
    ).resolves.toMatchObject({ discovery: { status: "succeeded" } });
    service.close();
  });

  it("rejects off-origin candidates before resolving them", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "pdpguard-catalog-"));
    directories.push(directory);
    let resolutions = 0;
    const service = new WorkspaceService(
      path.join(directory, "pdpguard.sqlite"),
      async () => {
        resolutions += 1;
        return [{ address: "93.184.216.34", family: 4 }];
      },
    );
    const principal = service.authenticateSession(
      service.issueSession("owner").token,
    );
    const workspace = service.createWorkspace(principal, "Acme");
    const store = await service.createStore(principal, workspace.id, {
      url: "https://example.com",
    });
    const beforeDiscovery = resolutions;

    service.startCatalogDiscovery(principal, store.id);
    await service.completeCatalogDiscovery(principal, store.id, [
      "https://other.example/products/off-origin",
    ]);
    expect(resolutions).toBe(beforeDiscovery);
    service.close();
  });

  it("times out before browser launch when initial DNS resolution hangs", async () => {
    const runner = new PlaywrightCatalogDiscoveryRunner(
      async () => new Promise(() => undefined),
      10,
    );
    await expect(runner.discover("https://example.com")).rejects.toBeInstanceOf(
      CatalogDiscoveryTimeoutError,
    );
  });

  it("does not publish a refresh after its validation deadline", async () => {
    const { service } = createService();
    const principal = service.authenticateSession(
      service.issueSession("owner").token,
    );
    const workspace = service.createWorkspace(principal, "Acme");
    const store = await service.createStore(principal, workspace.id, {
      url: "https://example.com",
    });
    service.startCatalogDiscovery(principal, store.id);

    await expect(
      service.completeCatalogDiscovery(
        principal,
        store.id,
        ["https://example.com/products/one"],
        Date.now() - 1,
      ),
    ).rejects.toBeInstanceOf(CatalogDiscoveryDeadlineError);
    expect(service.getStoreCatalog(principal, store.id).items).toEqual([]);
    service.close();
  });
});
