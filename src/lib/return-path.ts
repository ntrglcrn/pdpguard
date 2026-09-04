const FALLBACK_PATH = "/stores";

export function trustedApplicationOrigin(requestUrl?: URL) {
  const configured = process.env.AUTH_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      return undefined;
    }
  }
  return process.env.NODE_ENV !== "production" ? requestUrl?.origin : undefined;
}

export function safeReturnPath(
  candidate: string | null | undefined,
  trustedOrigin: string | undefined,
  fallback = FALLBACK_PATH,
) {
  if (!candidate || !trustedOrigin || hasUnsafeEncoding(candidate))
    return fallback;
  try {
    const destination = new URL(candidate, trustedOrigin);
    if (destination.origin !== trustedOrigin) return fallback;
    const localPath = `${destination.pathname}${destination.search}${destination.hash}`;
    return localPath.startsWith("//") ? fallback : localPath;
  } catch {
    return fallback;
  }
}

function hasUnsafeEncoding(value: string) {
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return true;
  let decoded = value;
  for (let index = 0; index < 2; index += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return true;
    }
    if (decoded.includes("\\") || decoded.startsWith("//")) return true;
  }
  return false;
}
