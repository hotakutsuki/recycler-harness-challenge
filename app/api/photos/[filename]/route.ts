import { contentType, read } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const bytes = await read(decodeURIComponent(filename));
  if (!bytes) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType(filename),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
