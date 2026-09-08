import { NextResponse } from "next/server";

import { auth } from "../../../../auth";
import { PostgresWorkspaceService } from "@/lib/postgres-workspace-service";
import { getWorkspaceService } from "@/lib/app-service";
import { safeReturnPath, trustedApplicationOrigin } from "@/lib/return-path";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  const requestUrl = new URL(request.url);
  const trustedOrigin = trustedApplicationOrigin(requestUrl);
  if (!trustedOrigin)
    return new Response("Sign-in is unavailable.", { status: 503 });
  const destination = safeReturnPath(
    requestUrl.searchParams.get("next"),
    trustedOrigin,
  );
  if (!session?.user?.id)
    return NextResponse.redirect(new URL(`/login?error=signin`, trustedOrigin));

  const service = await getWorkspaceService();
  const userId = service instanceof PostgresWorkspaceService
    ? await service.findOrCreateExternalUser("auth0", session.user.id.replace(/^auth0:/, ""))
    : session.user.id;
  const local = await service.issueSession(userId, undefined, {
    secureCookie: process.env.NODE_ENV === "production",
  });
  const response = NextResponse.redirect(new URL(destination, trustedOrigin));
  response.headers.set("Set-Cookie", local.cookie);
  return response;
}
