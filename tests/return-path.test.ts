import { describe, expect, it } from "vitest";

import { safeReturnPath } from "@/lib/return-path";

const trustedOrigin = "https://trusted.example";

describe("safeReturnPath", () => {
  it.each([
    ["/stores", "/stores"],
    ["/stores/abc", "/stores/abc"],
    ["/stores/abc/monitoring", "/stores/abc/monitoring"],
    ["/stores?foo=bar", "/stores?foo=bar"],
    ["/account", "/account"],
    ["/stores/abc?foo=bar#history", "/stores/abc?foo=bar#history"],
    [
      "https://trusted.example/stores/abc?foo=bar#history",
      "/stores/abc?foo=bar#history",
    ],
  ])("keeps the login return path local: %s", (candidate, expected) => {
    expect(safeReturnPath(candidate, trustedOrigin)).toBe(expected);
  });

  it.each([
    "https://evil.example",
    "http://evil.example",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "/\\\\evil.example",
    "\\evil.example",
    "\\\\evil.example",
    "/%5C%5Cevil.example",
    "/%2F%2Fevil.example",
    "/%255C%255Cevil.example",
    "/%252F%252Fevil.example",
    "javascript:alert(1)",
    "data:text/html,test",
    "mailto:security@evil.example",
    "ftp://evil.example",
    "https://trusted.example.evil.example",
    "https://trusted.example@evil.example",
    "https://trusted.example//evil.example",
    "/stores\nhttps://evil.example",
  ])("falls back for hostile callback input: %s", (candidate) => {
    expect(safeReturnPath(candidate, trustedOrigin)).toBe("/stores");
  });

  it("uses the same policy for login and the session callback", () => {
    const candidate = "/\\\\evil.example";
    expect(safeReturnPath(candidate, trustedOrigin)).toBe("/stores");
  });
});
