export function developmentBootstrapAvailable(requestUrl: URL) {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.PDP_GUARD_DEV_BOOTSTRAP === "1" &&
    isLoopbackHost(requestUrl.hostname)
  );
}

export function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}
