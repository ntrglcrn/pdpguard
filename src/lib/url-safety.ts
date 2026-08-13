import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const MAX_URL_LENGTH = 2_048;

export type ResolvedAddress = { address: string; family: number };
export type DnsResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const blockedAddresses = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

export const systemDnsResolver: DnsResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

function normalizeHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function isPublicIpAddress(address: string): boolean {
  const mappedIpv4 = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  if (mappedIpv4) return isPublicIpAddress(mappedIpv4);
  const family = isIP(address);
  if (family === 0) return false;
  return !blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

export async function validatePublicUrl(
  input: string,
  resolver: DnsResolver = systemDnsResolver,
): Promise<URL> {
  if (input.length > MAX_URL_LENGTH) {
    throw new UnsafeUrlError("The URL is too long.");
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("Enter a valid absolute URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only HTTP and HTTPS URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs containing credentials are not allowed.");
  }

  const hostname = normalizeHostname(url.hostname).toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid")
  ) {
    throw new UnsafeUrlError("Local and internal hostnames are not allowed.");
  }

  const ipFamily = isIP(hostname);
  const addresses = ipFamily
    ? [{ address: hostname, family: ipFamily }]
    : await resolveHostname(hostname, resolver);

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicIpAddress(address))
  ) {
    throw new UnsafeUrlError(
      "The URL resolves to a non-public network address.",
    );
  }

  url.hash = "";
  return url;
}

async function resolveHostname(hostname: string, resolver: DnsResolver) {
  try {
    return await resolver(hostname);
  } catch {
    throw new UnsafeUrlError("The hostname could not be resolved.");
  }
}
