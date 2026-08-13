import { describe, expect, it } from "vitest";

import {
  isPublicIpAddress,
  UnsafeUrlError,
  validatePublicUrl,
} from "@/lib/url-safety";

const publicResolver = async () => [{ address: "93.184.216.34", family: 4 }];

describe("validatePublicUrl", () => {
  it("accepts a public HTTP(S) URL and removes its fragment", async () => {
    await expect(
      validatePublicUrl("https://example.com/product#details", publicResolver),
    ).resolves.toMatchObject({
      href: "https://example.com/product",
    });
  });

  it.each([
    "file:///etc/passwd",
    "ftp://example.com/file",
    "https://user:password@example.com",
    "http://localhost/product",
    "http://shop.local/product",
  ])("rejects unsafe syntax: %s", async (value) => {
    await expect(
      validatePublicUrl(value, publicResolver),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects mixed public and private DNS answers", async () => {
    await expect(
      validatePublicUrl("https://example.com", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toThrow("non-public");
  });

  it("rejects unusual numeric IPv4 forms normalized by URL", async () => {
    await expect(validatePublicUrl("http://2130706433/")).rejects.toThrow(
      "non-public",
    );
  });
});

describe("isPublicIpAddress", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "192.0.2.1",
    "198.51.100.2",
    "203.0.113.3",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ])("blocks local/private/reserved address %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows public address %s",
    (address) => expect(isPublicIpAddress(address)).toBe(true),
  );
});
