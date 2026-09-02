import { authenticateAppRequest, getWorkspaceService } from "@/lib/app-service";
import { AuthorizationError } from "@/lib/workspace-service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const artifact = getWorkspaceService().readArtifact(
      authenticateAppRequest(request),
      (await params).id,
    );
    return new Response(new Uint8Array(artifact.contents), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'inline; filename="pdp-audit-evidence.png"',
        "Content-Type": artifact.reference.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError)
      return new Response("Not found", { status: 404 });
    console.error("Artifact read failed", error);
    return new Response("Artifact unavailable", { status: 500 });
  }
}
