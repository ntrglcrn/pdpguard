import { createHash } from "node:crypto";

import type { Locator, Page, Response, Route } from "playwright";
import { z } from "zod";

import {
  MAX_SCENARIO_STEPS,
  type Scenario,
  type ScenarioLocator,
  type ScenarioRunResult,
  type ScenarioStep,
} from "@/domain/scenario";
import {
  systemDnsResolver,
  UnsafeUrlError,
  validatePublicUrl,
  type DnsResolver,
} from "@/lib/url-safety";

const MAX_VALUE_LENGTH = 500;
const MAX_EVIDENCE_ITEMS = 12;
const MAX_EVIDENCE_LENGTH = 500;
const MAX_STEP_TIMEOUT_MS = 5_000;
const SENSITIVE_FIELD =
  /password|passcode|secret|token|card|cvv|cvc|iban|account/i;
const PLACEHOLDER_PATH_SEGMENT =
  /^(?:null|undefined|\[[^\]]+\]|:[a-z][\w-]*)$/i;

const boundedString = z.string().trim().min(1).max(MAX_VALUE_LENGTH);
const locatorSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("testId"), value: boundedString }).strict(),
  z
    .object({
      by: z.literal("text"),
      value: boundedString,
      exact: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      by: z.literal("label"),
      value: boundedString,
      exact: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      by: z.literal("role"),
      role: z.enum([
        "button",
        "checkbox",
        "dialog",
        "heading",
        "link",
        "option",
        "radio",
        "textbox",
      ]),
      name: boundedString.optional(),
      exact: z.boolean().optional(),
    })
    .strict(),
]);
const sourceSchema = z.union([
  z.enum(["text", "value"]),
  z.string().regex(/^attribute:[a-zA-Z_:][\w:.-]{0,63}$/),
]);
const stepSchema = z.union([
  z
    .object({ action: z.literal("navigate"), url: z.string().max(2_048) })
    .strict(),
  z.object({ action: z.literal("click"), locator: locatorSchema }).strict(),
  z
    .object({
      action: z.literal("select"),
      locator: locatorSchema,
      value: boundedString,
    })
    .strict(),
  z
    .object({
      action: z.literal("fill"),
      locator: locatorSchema,
      value: z.string().max(MAX_VALUE_LENGTH),
    })
    .strict(),
  z
    .object({
      action: z.literal("press"),
      locator: locatorSchema.optional(),
      key: z.enum([
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "Enter",
        "Escape",
        "Space",
        "Tab",
      ]),
    })
    .strict(),
  z
    .object({
      action: z.literal("scroll"),
      locator: locatorSchema.optional(),
      pixels: z.number().int().min(-2_000).max(2_000).optional(),
    })
    .strict(),
  z.object({ action: z.literal("back") }).strict(),
  z
    .object({
      action: z.literal("waitReady"),
      locator: locatorSchema,
      timeoutMs: z.number().int().min(100).max(MAX_STEP_TIMEOUT_MS).optional(),
    })
    .strict(),
  z
    .object({
      capture: z.literal("value"),
      name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
      locator: locatorSchema,
      source: sourceSchema,
    })
    .strict(),
  z
    .object({
      capture: z.literal("fingerprint"),
      name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    })
    .strict(),
  z
    .object({
      capture: z.literal("url"),
      name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    })
    .strict(),
  z
    .object({
      capture: z.literal("linkTarget"),
      name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
      locator: locatorSchema,
      part: z.union([
        z
          .object({ query: z.string().regex(/^[a-zA-Z0-9_.-]{1,64}$/) })
          .strict(),
        z.object({ pathSegment: z.number().int().min(-20).max(20) }).strict(),
      ]),
    })
    .strict(),
  z
    .object({
      assert: z.literal("url"),
      equals: z.string().max(2_048).optional(),
      matches: z.string().max(2_048).optional(),
    })
    .strict()
    .refine(
      (value) =>
        Number(Boolean(value.equals)) + Number(Boolean(value.matches)) === 1,
      "Specify exactly one URL expectation.",
    ),
  z
    .object({
      assert: z.literal("visibleText"),
      text: boundedString,
      locator: locatorSchema.optional(),
    })
    .strict(),
  z
    .object({
      assert: z.literal("urlChanged"),
      from: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    })
    .strict(),
  z
    .object({
      assert: z.literal("mainContentChanged"),
      from: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    })
    .strict(),
  z
    .object({
      assert: z.literal("navigationCompleted"),
      urlMatches: z.string().max(2_048).optional(),
    })
    .strict(),
  z.object({ assert: z.literal("errorPage"), locator: locatorSchema }).strict(),
  z
    .object({
      assert: z.literal("historyBack"),
      url: z.string().max(2_048),
      contentFrom: z
        .string()
        .regex(/^[a-z][a-z0-9_-]{0,63}$/)
        .optional(),
    })
    .strict(),
  z
    .object({
      assert: z.literal("absentText"),
      text: boundedString,
      locator: locatorSchema.optional(),
    })
    .strict(),
  z
    .object({
      assert: z.literal("state"),
      locator: locatorSchema,
      state: z.enum(["visible", "hidden", "enabled", "selected", "reachable"]),
    })
    .strict(),
  z
    .object({
      assert: z.literal("fingerprintChanged"),
      from: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    })
    .strict(),
  z
    .object({
      assert: z.literal("capturedValue"),
      locator: locatorSchema,
      source: sourceSchema,
      equalsCapture: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    })
    .strict(),
  z
    .object({
      assert: z.literal("productIdentity"),
      kind: z.enum(["title", "sku", "productId"]),
      expected: boundedString,
      locator: locatorSchema,
      source: sourceSchema.optional(),
    })
    .strict(),
  z
    .object({
      assert: z.literal("productIdentity"),
      kind: z.literal("canonicalUrl"),
      expected: z.string().max(2_048),
    })
    .strict(),
  z
    .object({
      assert: z.literal("productIdentity"),
      kind: z.literal("jsonLd"),
      field: z.enum(["@id", "name", "productID", "productId", "sku", "url"]),
      expected: boundedString,
    })
    .strict(),
  z
    .object({
      assert: z.literal("escapeClosesDialog"),
      locator: locatorSchema,
    })
    .strict(),
  z
    .object({
      assert: z.literal("reachability"),
      locator: locatorSchema,
      check: z.enum([
        "reachable",
        "centerClickable",
        "notCovered",
        "scrollableIntoView",
      ]),
    })
    .strict(),
  z
    .object({
      assert: z.literal("request"),
      urlMatches: z.string().max(2_048),
      method: z
        .string()
        .regex(/^[A-Z]{3,10}$/)
        .optional(),
      status: z.number().int().min(100).max(599).optional(),
      query: z.record(z.string().max(100), z.string().max(200)).optional(),
    })
    .strict(),
]);
const scenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    version: z.number().int().positive(),
    name: boundedString,
    approvedOrigins: z.array(z.string().max(2_048)).min(1).max(8),
    evidenceQueryKeys: z
      .array(z.string().regex(/^[a-zA-Z0-9_.-]{1,64}$/))
      .max(16)
      .optional(),
    steps: z.array(stepSchema).min(1).max(MAX_SCENARIO_STEPS),
  })
  .strict();

type ObservedRequest = { method: string; status: number; url: string };

export class ScenarioValidationError extends Error {
  constructor(message = "The scenario definition is invalid.") {
    super(message);
    this.name = "ScenarioValidationError";
  }
}

class ScenarioStepTimeoutError extends Error {
  constructor() {
    super("The step exceeded its time limit.");
  }
}

export async function runScenario(
  page: Page,
  input: Scenario,
  options: {
    resolver?: DnsResolver;
    locale?: string;
    screenshotUrl?: string;
  } = {},
): Promise<ScenarioRunResult> {
  const parsed = scenarioSchema.safeParse(input);
  if (!parsed.success) throw new ScenarioValidationError();
  const scenario = parsed.data as Scenario;
  const resolver = options.resolver ?? systemDnsResolver;
  const origins = new Set<string>();
  for (const origin of scenario.approvedOrigins) {
    const safe = await validatePublicUrl(origin, resolver);
    if (safe.pathname !== "/" || safe.search)
      throw new ScenarioValidationError(
        "Approved origins must not contain a path or query.",
      );
    origins.add(safe.origin);
  }

  const requests: ObservedRequest[] = [];
  let navigationSafetyError: UnsafeUrlError | null = null;
  const safeNavigation = async (route: Route) => {
    const request = route.request();
    if (
      !request.isNavigationRequest() ||
      request.frame() !== page.mainFrame()
    ) {
      await route.fallback();
      return;
    }
    try {
      await approvedUrl(request.url(), origins, resolver);
      await route.fallback();
    } catch (error) {
      navigationSafetyError =
        error instanceof UnsafeUrlError
          ? error
          : new UnsafeUrlError("An unsafe navigation was blocked.");
      await route.abort("blockedbyclient");
    }
  };
  const responses = (response: Response) => {
    if (requests.length >= 100) return;
    const request = response.request();
    requests.push({
      method: request.method(),
      status: response.status(),
      url: response.url(),
    });
  };
  page.on("response", responses);
  await page.route("**/*", safeNavigation);
  const captures = new Map<string, string>();
  const observations: string[] = [];
  const sourceUrl = page.url();

  try {
    for (const [index, step] of scenario.steps.entries()) {
      try {
        await withTimeout(
          executeStep(page, step, {
            captures,
            origins,
            requests,
            resolver,
          }),
        );
        assertApprovedPage(page, origins);
        observations.push(
          stepObservation(
            step,
            page,
            new Set(scenario.evidenceQueryKeys ?? []),
          ),
        );
      } catch (error) {
        const finding = scenarioFinding(
          scenario,
          "failed",
          index,
          step,
          sourceUrl,
          page,
          options,
          safeError(navigationSafetyError ?? error),
          observations,
        );
        if (error instanceof ScenarioStepTimeoutError)
          await page
            .context()
            .close()
            .catch(() => undefined);
        return {
          completedSteps: index,
          finding,
        };
      }
    }
    return {
      completedSteps: scenario.steps.length,
      finding: scenarioFinding(
        scenario,
        "passed",
        undefined,
        undefined,
        sourceUrl,
        page,
        options,
        "All scenario steps passed.",
        observations,
      ),
    };
  } finally {
    page.off("response", responses);
    await page.unroute("**/*", safeNavigation).catch(() => undefined);
  }
}

async function executeStep(
  page: Page,
  step: ScenarioStep,
  context: {
    captures: Map<string, string>;
    origins: Set<string>;
    requests: ObservedRequest[];
    resolver: DnsResolver;
  },
) {
  if ("action" in step) {
    if (step.action === "navigate") {
      const url = await approvedUrl(
        step.url,
        context.origins,
        context.resolver,
      );
      await page.goto(url.href, { waitUntil: "domcontentloaded" });
    } else if (step.action === "click")
      await (await unique(page, step.locator)).click();
    else if (step.action === "select")
      await (await unique(page, step.locator)).selectOption(step.value);
    else if (step.action === "fill") {
      if (SENSITIVE_FIELD.test(locatorDescription(step.locator)))
        throw new Error("Sensitive fields cannot be filled.");
      await (await unique(page, step.locator)).fill(step.value);
    } else if (step.action === "press")
      await (
        step.locator ? await unique(page, step.locator) : page.locator("body")
      ).press(step.key);
    else if (step.action === "scroll") {
      if (step.locator)
        await (await unique(page, step.locator)).scrollIntoViewIfNeeded();
      else await page.mouse.wheel(0, step.pixels ?? 600);
    } else if (step.action === "back")
      await page.goBack({ waitUntil: "domcontentloaded" });
    else
      await (
        await unique(page, step.locator)
      ).waitFor({
        state: "visible",
        timeout: step.timeoutMs ?? MAX_STEP_TIMEOUT_MS,
      });
    return;
  }

  if ("capture" in step) {
    if (step.capture === "fingerprint")
      context.captures.set(step.name, await mainFingerprint(page));
    else if (step.capture === "url")
      context.captures.set(step.name, page.url());
    else if (step.capture === "value")
      context.captures.set(
        step.name,
        normalize(
          await readValue(await unique(page, step.locator), step.source),
        ),
      );
    else {
      const href = await (
        await unique(page, step.locator)
      ).getAttribute("href");
      if (!href)
        throw new Error("Expected the configured link to have an href.");
      const target = await approvedUrl(
        new URL(href, page.url()).href,
        context.origins,
        context.resolver,
      );
      const segments = target.pathname.split("/").filter(Boolean);
      const value =
        "query" in step.part
          ? target.searchParams.get(step.part.query)
          : segments.at(step.part.pathSegment);
      if (!value)
        throw new Error(
          "Expected the link target to contain the configured product identity.",
        );
      context.captures.set(step.name, normalize(value));
    }
    return;
  }

  if (step.assert === "url") {
    const pass = step.equals
      ? page.url() === step.equals
      : globMatches(page.url(), step.matches!);
    if (!pass)
      throw new Error(
        `Expected URL ${step.equals ?? step.matches}; observed ${page.url()}.`,
      );
  } else if (step.assert === "urlChanged") {
    const before = requiredCapture(context.captures, step.from);
    if (page.url() === before)
      throw new Error(`Expected URL to change; observed ${page.url()}.`);
  } else if (step.assert === "mainContentChanged") {
    const before = requiredCapture(context.captures, step.from);
    const observed = await mainFingerprint(page);
    if (observed === before)
      throw new Error(
        `Expected main content to change; observed fingerprint ${observed}.`,
      );
  } else if (step.assert === "navigationCompleted") {
    await page.waitForLoadState("domcontentloaded", {
      timeout: MAX_STEP_TIMEOUT_MS,
    });
    if (step.urlMatches && !globMatches(page.url(), step.urlMatches))
      throw new Error(
        `Expected completed navigation URL ${step.urlMatches}; observed ${page.url()}.`,
      );
  } else if (step.assert === "errorPage") {
    if (!(await (await unique(page, step.locator)).isVisible()))
      throw new Error(
        `Expected configured error page ${locatorDescription(step.locator)} to be visible.`,
      );
  } else if (step.assert === "historyBack") {
    const content = step.contentFrom
      ? requiredCapture(context.captures, step.contentFrom)
      : null;
    const observedContent = content ? await mainFingerprint(page) : null;
    if (page.url() !== step.url || (content && observedContent !== content))
      throw new Error(
        `Expected history back URL ${step.url}${content ? ` and fingerprint ${content}` : ""}; observed ${page.url()}${observedContent ? ` and fingerprint ${observedContent}` : ""}.`,
      );
  } else if (step.assert === "visibleText" || step.assert === "absentText") {
    const root = step.locator
      ? await unique(page, step.locator)
      : page.locator("body");
    const found = await root
      .getByText(step.text, { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if ((step.assert === "visibleText") !== found)
      throw new Error(
        `Expected text ${step.assert === "visibleText" ? "to be visible" : "to be absent"}: ${step.text}.`,
      );
  } else if (step.assert === "state") {
    const locator = await unique(page, step.locator);
    const reachability =
      step.state === "reachable" ? await inspectReachability(locator) : null;
    const pass =
      step.state === "visible"
        ? await locator.isVisible()
        : step.state === "hidden"
          ? await locator.isHidden()
          : step.state === "enabled"
            ? await locator.isEnabled()
            : step.state === "selected"
              ? await locator
                  .isChecked()
                  .catch(() =>
                    locator.evaluate(
                      (element) =>
                        element instanceof HTMLOptionElement &&
                        element.selected,
                    ),
                  )
              : reachability!.reachable;
    if (!pass)
      throw new Error(
        `Expected ${locatorDescription(step.locator)} to be ${step.state}.${reachability ? ` ${reachability.evidence}` : ""}`,
      );
  } else if (step.assert === "fingerprintChanged") {
    const before = requiredCapture(context.captures, step.from);
    const observed = await mainFingerprint(page);
    if (observed === before)
      throw new Error("Expected the main-content fingerprint to change.");
  } else if (step.assert === "capturedValue") {
    const expected = requiredCapture(context.captures, step.equalsCapture);
    const observed = normalize(
      await readValue(await unique(page, step.locator), step.source),
    );
    if (observed !== expected)
      throw new Error(`Expected ${expected}; observed ${observed}.`);
  } else if (step.assert === "productIdentity") {
    const observed = await readProductIdentity(page, step);
    if (
      !observed.some(
        (value) =>
          normalizeIdentity(step.kind, value) ===
          normalizeIdentity(step.kind, step.expected),
      )
    )
      throw new Error(
        `Expected ${step.kind} identity ${safeIdentity(step.kind, step.expected)}; observed ${observed.map((value) => safeIdentity(step.kind, value)).join(", ") || "none"}.`,
      );
  } else if (step.assert === "escapeClosesDialog") {
    if (step.locator.by !== "role" || step.locator.role !== "dialog")
      throw new ScenarioValidationError(
        "Escape dismissal requires a configured dialog role locator.",
      );
    const dialog = await unique(page, step.locator);
    if (!(await dialog.isVisible()))
      throw new Error(
        "Expected the configured dialog to be visible before Escape.",
      );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 1_000 }).catch(() => {
      throw new Error("Expected the configured dialog to close after Escape.");
    });
  } else if (step.assert === "reachability") {
    const result = await inspectReachability(await unique(page, step.locator));
    if (!result[step.check])
      throw new Error(
        `Expected ${locatorDescription(step.locator)} to be ${step.check}. ${result.evidence}`,
      );
  } else {
    const matches = (request: ObservedRequest) =>
      request.method === (step.method ?? request.method) &&
      request.status === (step.status ?? request.status) &&
      globMatches(request.url, step.urlMatches) &&
      Object.entries(step.query ?? {}).every(
        ([key, value]) => new URL(request.url).searchParams.get(key) === value,
      );
    const deadline = Date.now() + MAX_STEP_TIMEOUT_MS;
    while (!context.requests.some(matches) && Date.now() < deadline)
      await page.waitForTimeout(50);
    const match = context.requests.find(matches);
    if (!match)
      throw new Error(
        `Expected matching ${step.method ?? "request"} ${step.urlMatches}.`,
      );
  }
}

function resolveLocator(page: Page, locator: ScenarioLocator): Locator {
  if (locator.by === "testId") return page.getByTestId(locator.value);
  if (locator.by === "text")
    return page.getByText(locator.value, { exact: locator.exact });
  if (locator.by === "label")
    return page.getByLabel(locator.value, { exact: locator.exact });
  return page.getByRole(locator.role, {
    name: locator.name,
    exact: locator.exact,
  });
}

async function unique(page: Page, spec: ScenarioLocator): Promise<Locator> {
  const locator = resolveLocator(page, spec);
  const count = await locator.count();
  if (count !== 1)
    throw new Error(
      `Locator ${locatorDescription(spec)} resolved to ${count} elements.`,
    );
  return locator;
}

async function approvedUrl(
  input: string,
  origins: Set<string>,
  resolver: DnsResolver,
) {
  const url = await validatePublicUrl(input, resolver);
  if (
    url.pathname
      .split("/")
      .filter(Boolean)
      .some((segment) =>
        PLACEHOLDER_PATH_SEGMENT.test(decodeURIComponent(segment)),
      )
  )
    throw new UnsafeUrlError(
      "URLs containing placeholder path segments are not allowed.",
    );
  if (!origins.has(url.origin))
    throw new UnsafeUrlError(
      "Navigation outside approved origins was blocked.",
    );
  return url;
}

function assertApprovedPage(page: Page, origins: Set<string>) {
  if (page.url() !== "about:blank" && !origins.has(new URL(page.url()).origin))
    throw new UnsafeUrlError(
      "Navigation outside approved origins was blocked.",
    );
}

async function readValue(
  locator: Locator,
  source: "text" | "value" | `attribute:${string}`,
) {
  if (source === "text") return (await locator.textContent()) ?? "";
  if (source === "value") return await locator.inputValue();
  return (await locator.getAttribute(source.slice("attribute:".length))) ?? "";
}

function requiredCapture(captures: Map<string, string>, name: string) {
  const value = captures.get(name);
  if (value === undefined) throw new Error(`Capture ${name} does not exist.`);
  return value;
}

async function readProductIdentity(
  page: Page,
  step: Extract<ScenarioStep, { assert: "productIdentity" }>,
): Promise<string[]> {
  if (step.kind === "canonicalUrl") {
    const href = await page
      .locator("link[rel~='canonical']")
      .first()
      .getAttribute("href");
    return href ? [new URL(href, page.url()).href] : [];
  }
  if (step.kind !== "jsonLd")
    return [
      await readValue(await unique(page, step.locator), step.source ?? "text"),
    ];

  return page.evaluate((field) => {
    const output: string[] = [];
    const records: Record<string, unknown>[] = [];
    let bytes = 0;
    for (const script of Array.from(
      document.querySelectorAll<HTMLScriptElement>(
        "script[type='application/ld+json']",
      ),
    ).slice(0, 50)) {
      const text = script.textContent ?? "";
      bytes += text.length;
      if (bytes > 1_000_000) break;
      try {
        const queue: unknown[] = [JSON.parse(text)];
        while (queue.length && records.length < 200) {
          const value = queue.shift();
          if (Array.isArray(value)) queue.push(...value);
          else if (value && typeof value === "object") {
            const record = value as Record<string, unknown>;
            records.push(record);
            if (record["@graph"]) queue.push(record["@graph"]);
            if (record.hasVariant) queue.push(record.hasVariant);
          }
        }
      } catch {
        // Malformed JSON-LD is not identity evidence.
      }
    }
    for (const record of records) {
      const types = Array.isArray(record["@type"])
        ? record["@type"]
        : [record["@type"]];
      if (
        !types.some(
          (type) =>
            typeof type === "string" &&
            /(?:^|schema\.org\/)(?:Product|ProductGroup)$/i.test(type),
        )
      )
        continue;
      const value = record[field];
      if (typeof value === "string" || typeof value === "number")
        output.push(String(value).slice(0, 500));
    }
    return output.slice(0, 20);
  }, step.field);
}

function normalizeIdentity(kind: string, value: string) {
  if (kind !== "canonicalUrl") return normalize(value);
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value.trim();
  }
}

function safeIdentity(kind: string, value: string) {
  return kind === "canonicalUrl"
    ? sanitizeUrl(value, new Set())
    : value.replace(/\s+/g, " ").trim().slice(0, MAX_VALUE_LENGTH);
}

async function inspectReachability(locator: Locator) {
  const before = await locator.boundingBox();
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  return locator.evaluate((element, beforeBox) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const centerInViewport =
      x >= 0 && x < innerWidth && y >= 0 && y < innerHeight;
    const hit = centerInViewport ? document.elementFromPoint(x, y) : null;
    const containers: string[] = [];
    let parent = element.parentElement;
    while (parent && containers.length < 4) {
      const parentStyle = getComputedStyle(parent);
      if (
        /(auto|scroll|hidden|clip)/.test(
          `${parentStyle.overflowX} ${parentStyle.overflowY}`,
        )
      )
        containers.push(
          `${parent.tagName.toLowerCase()} overflow=${parentStyle.overflowX}/${parentStyle.overflowY} scroll=${parent.scrollWidth}x${parent.scrollHeight} client=${parent.clientWidth}x${parent.clientHeight}`,
        );
      parent = parent.parentElement;
    }
    const enabled =
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-disabled") !== "true";
    const visible =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0 &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < innerHeight &&
      rect.left < innerWidth;
    const notCovered = Boolean(
      hit && (hit === element || element.contains(hit)),
    );
    const centerClickable =
      visible && centerInViewport && enabled && notCovered;
    return {
      reachable: centerClickable,
      centerClickable,
      notCovered: visible && notCovered,
      scrollableIntoView:
        visible &&
        Boolean(beforeBox) &&
        Number.isFinite(beforeBox!.x) &&
        Number.isFinite(beforeBox!.y),
      evidence: `Box ${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}; actionable point ${Math.round(x)},${Math.round(y)} hit ${hit?.tagName.toLowerCase() ?? "nothing"}; overflow: ${containers.join(" | ") || "none"}.`,
    };
  }, before);
}

function normalize(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US")
    .slice(0, MAX_VALUE_LENGTH);
}

async function mainFingerprint(page: Page) {
  const content = normalize(
    await page
      .locator("main, [role='main'], article, body")
      .first()
      .innerText(),
  ).slice(0, MAX_VALUE_LENGTH);
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function globMatches(value: string, pattern: string) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function locatorDescription(locator: ScenarioLocator) {
  return locator.by === "role"
    ? `role=${locator.role}${locator.name ? ` name=${locator.name}` : ""}`
    : `${locator.by}=${locator.value}`;
}

function safeError(error: unknown) {
  if (error instanceof ScenarioStepTimeoutError) return error.message;
  if (
    error instanceof UnsafeUrlError ||
    error instanceof ScenarioValidationError
  )
    return error.message;
  if (
    error instanceof Error &&
    /^(Expected|Capture|Locator|Sensitive)/.test(error.message)
  )
    return error.message;
  return "The step failed or timed out.";
}

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ScenarioStepTimeoutError()),
          MAX_STEP_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function scenarioFinding(
  scenario: Scenario,
  status: "passed" | "failed",
  failedIndex: number | undefined,
  step: ScenarioStep | undefined,
  sourceUrl: string,
  page: Page,
  options: { locale?: string; screenshotUrl?: string },
  detail: string,
  observations: string[],
) {
  const queryKeys = new Set(scenario.evidenceQueryKeys ?? []);
  const evidence = [
    `Scenario: ${scenario.id} v${scenario.version}; rule: scenario-${scenario.id}.`,
    failedIndex === undefined
      ? `Completed ${scenario.steps.length} steps.`
      : `Failed step ${failedIndex + 1}: ${stepLabel(step!)}.`,
    `Source URL: ${sanitizeUrl(sourceUrl, queryKeys)}.`,
    `Final URL: ${sanitizeUrl(page.url(), queryKeys)}.`,
    `Viewport: ${page.viewportSize()?.width ?? "unknown"}x${page.viewportSize()?.height ?? "unknown"}; locale: ${options.locale ?? "unspecified"}.`,
    detail,
    ...observations.slice(-3),
    ...(options.screenshotUrl ? [`Screenshot: ${options.screenshotUrl}.`] : []),
  ]
    .slice(0, MAX_EVIDENCE_ITEMS)
    .map((item) => item.slice(0, MAX_EVIDENCE_LENGTH));
  return {
    id: `scenario-${scenario.id}`,
    ruleId: `scenario-${scenario.id}`,
    title: scenario.name,
    description:
      status === "passed"
        ? "The configured scenario completed successfully."
        : "The configured scenario did not meet an expected state.",
    severity: status === "passed" ? ("info" as const) : ("critical" as const),
    status,
    evidence,
    recommendation:
      status === "passed"
        ? "No action is required."
        : "Reproduce the failed step with the recorded locator and expected state.",
  };
}

function stepObservation(
  step: ScenarioStep,
  page: Page,
  allowedQueryKeys: Set<string>,
) {
  if ("action" in step && step.action === "click")
    return `Clicked ${locatorDescription(step.locator)}; resulting URL: ${sanitizeUrl(page.url(), allowedQueryKeys)}.`;
  if ("action" in step && step.action === "back")
    return `History back completed; resulting URL: ${sanitizeUrl(page.url(), allowedQueryKeys)}.`;
  if ("assert" in step && step.assert === "navigationCompleted")
    return `Navigation completed at ${sanitizeUrl(page.url(), allowedQueryKeys)}.`;
  if ("assert" in step && step.assert === "productIdentity")
    return `Passed ${step.kind} identity assertion for ${safeIdentity(step.kind, step.expected)}.`;
  if ("assert" in step && step.assert === "reachability")
    return `Passed ${step.check} assertion for ${locatorDescription(step.locator)}.`;
  if ("assert" in step && step.assert === "escapeClosesDialog")
    return `Escape closed ${locatorDescription(step.locator)}.`;
  if ("assert" in step) return `Passed assertion: ${step.assert}.`;
  if ("capture" in step) return `Captured ${step.capture}: ${step.name}.`;
  return `Completed action: ${step.action}.`;
}

function stepLabel(step: ScenarioStep) {
  if ("action" in step) return step.action;
  if ("capture" in step) return `capture ${step.name}`;
  return `assert ${step.assert}`;
}

function sanitizeUrl(input: string, allowedQueryKeys: Set<string>) {
  try {
    const url = new URL(input);
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (!allowedQueryKeys.has(key)) url.searchParams.delete(key);
    return url.href.slice(0, MAX_VALUE_LENGTH);
  } catch {
    return "unavailable";
  }
}
