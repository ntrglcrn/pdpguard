import { NextResponse } from "next/server";

import { auth } from "../../../../auth";
import { getWorkspaceService } from "@/lib/app-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  const destination = safeDestination(new URL(request.url));
  if (!session?.user?.id)
    return NextResponse.redirect(new URL(`/login?error=signin`, request.url));

  const local = getWorkspaceService().issueSession(session.user.id, undefined, {
    secureCookie: process.env.NODE_ENV === "production",
  });
  const response = NextResponse.redirect(destination);
  response.headers.set("Set-Cookie", local.cookie);
  return response;
}

function safeDestination(requestUrl: URL) {
  const next = requestUrl.searchParams.get("next") || "/stores";
  return next.startsWith("/") && !next.startsWith("//")
    ? new URL(next, requestUrl)
    : new URL("/stores", requestUrl);
}
