import { screenshotStorage } from "@/lib/screenshot-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contents = await screenshotStorage.read(id);
  if (!contents) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(contents), {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="pdp-audit-${id}.png"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
