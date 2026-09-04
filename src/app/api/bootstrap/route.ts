import { NextResponse } from "next/server";

import { authenticateAppRequest, getWorkspaceService } from "@/lib/app-service";
import { AuthorizationError } from "@/lib/workspace-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!developmentBootstrapAllowed())
    return new Response("Not found", { status: 404 });
  const requestUrl = new URL(request.url);
  if (!isLoopback(requestUrl.hostname))
    return new Response("Not found", { status: 404 });

  const service = getWorkspaceService();
  let principal;
  let sessionCookie: string | undefined;
  try {
    principal = authenticateAppRequest(request);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
    const session = service.issueSession("local-user", undefined, {
      secureCookie: false,
    });
    principal = service.authenticateSession(session.token);
    sessionCookie = session.cookie;
  }

  if (service.listWorkspaces(principal).length === 0)
    service.createWorkspace(principal, "Local workspace");

  const destination = safeDestination(requestUrl);
  const response = NextResponse.redirect(destination);
  if (sessionCookie) response.headers.set("Set-Cookie", sessionCookie);
  return response;
}

function safeDestination(requestUrl: URL) {
  try {
    const destination = new URL(
      requestUrl.searchParams.get("next") || "/stores",
      requestUrl,
    );
    if (destination.origin === requestUrl.origin) return destination;
  } catch {}
  return new URL("/stores", requestUrl);
}

function isLoopback(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function developmentBootstrapAllowed() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.PDP_GUARD_DEV_BOOTSTRAP === "1"
  );
}
