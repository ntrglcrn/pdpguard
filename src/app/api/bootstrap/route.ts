import { NextResponse } from "next/server";

import { authenticateAppRequest, getWorkspaceService } from "@/lib/app-service";
import { developmentBootstrapAvailable } from "@/lib/development-bootstrap";
import { AuthorizationError } from "@/lib/workspace-contract";
import { safeReturnPath, trustedApplicationOrigin } from "@/lib/return-path";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (!developmentBootstrapAvailable(requestUrl))
    return new Response("Not found", { status: 404 });

  const service = await getWorkspaceService();
  let principal;
  let sessionCookie: string | undefined;
  try {
    principal = await authenticateAppRequest(request);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
    const session = await service.issueSession("local-user", undefined, {
      secureCookie: false,
    });
    principal = await service.authenticateSession(session.token);
    sessionCookie = session.cookie;
  }

  if ((await service.listWorkspaces(principal)).length === 0)
    await service.createWorkspace(principal, "Local workspace");

  const destination = new URL(
    safeReturnPath(
      requestUrl.searchParams.get("next"),
      trustedApplicationOrigin(requestUrl),
    ),
    requestUrl,
  );
  const response = NextResponse.redirect(destination);
  if (sessionCookie) response.headers.set("Set-Cookie", sessionCookie);
  return response;
}
