import { authenticateAppRequest, getWorkspaceService } from "@/lib/app-service";
import { AuthorizationError } from "@/lib/workspace-contract";
import { PostgresWorkspaceService } from "@/lib/postgres-workspace-service";
import { S3ArtifactStore } from "@/lib/artifact-store";
import { hostedRuntimeConfig } from "@/lib/hosted-runtime-config";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const service = await getWorkspaceService();
    const principal = await authenticateAppRequest(request);
    const id = (await params).id;
    let artifact;
    if (service instanceof PostgresWorkspaceService) {
      const metadata = await service.readArtifactMetadata(principal, id);
      const config = hostedRuntimeConfig();
      if (!config) throw new Error("Hosted storage is unavailable.");
      const contents = await new S3ArtifactStore(config).get(metadata.storageKey);
      if (!contents) return new Response("Not found", { status: 404 });
      artifact = { reference: metadata.reference, contents };
    } else {
      artifact = service.readArtifact(principal, id);
    }
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
