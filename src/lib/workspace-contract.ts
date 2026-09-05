import {
  UnsafeUrlError,
  validatePublicUrl,
  type DnsResolver,
} from "@/lib/url-safety";

export const SESSION_COOKIE_NAME = "pdpguard_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const STORE_AUDIT_MAX_PDPS = 5;
export const STORE_AUDIT_RULESET_VERSION = "pdp-rules-v1";

export class AuthorizationError extends Error {
  constructor() {
    super("The requested resource was not found.");
    this.name = "AuthorizationError";
  }
}

export class UnsafeStoreTargetError extends UnsafeUrlError {
  constructor() {
    super("The product page URL must use the store origin.");
    this.name = "UnsafeStoreTargetError";
  }
}

export class CatalogDiscoveryDeadlineError extends Error {
  constructor() {
    super("Catalog discovery exceeded its time limit.");
    this.name = "CatalogDiscoveryDeadlineError";
  }
}

export class EmptyStoreCatalogError extends Error {
  constructor() {
    super("Discover active product pages before running a Store Audit.");
    this.name = "EmptyStoreCatalogError";
  }
}

export function requiredId(value: string) {
  const id = value.trim();
  if (!id || id.length > 200) throw new Error("A valid ID is required.");
  return id;
}

export function requiredName(value: string) {
  const name = value.trim();
  if (!name || name.length > 120)
    throw new Error("Name must be 1–120 characters.");
  return name;
}

export function sessionCookie(token: string, ttlMs: number, secure: boolean) {
  const secureAttribute = secure ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict${secureAttribute}; Path=/; Max-Age=${Math.floor(ttlMs / 1_000)}`;
}

export function requiredCategoryName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  return name && name.length <= 120 ? name : "Unlabeled category";
}

export function normalizedHref(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}

export async function validateBeforeDeadline(
  input: string,
  resolver: DnsResolver | undefined,
  deadline: number,
) {
  if (!Number.isFinite(deadline)) return validatePublicUrl(input, resolver);
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new CatalogDiscoveryDeadlineError();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      validatePublicUrl(input, resolver),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new CatalogDiscoveryDeadlineError()),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
