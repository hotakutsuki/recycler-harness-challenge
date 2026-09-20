import { NextResponse } from "next/server";
import { list, save, url } from "@/lib/storage";

/**
 * Upload endpoint for the capture screen.
 *
 * For now it stores the photo and nothing more: extraction is wired in next, at
 * which point this creates a queued row and hands off to the worker. Keeping the
 * capture path working first means the sheets can be photographed while the rest
 * of the pipeline is still being built.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "no photos in request" }, { status: 400 });
  }

  const saved = await Promise.all(files.map(save));
  return NextResponse.json({
    photos: saved.map((p) => ({ ...p, url: url(p.filename) })),
  });
}

export async function GET() {
  const photos = await list();
  return NextResponse.json({ photos: photos.map((p) => ({ ...p, url: url(p.filename) })) });
}
