import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { save, url } from "@/lib/storage";
import { enqueue, recoverInterrupted } from "@/lib/worker";

/**
 * Upload endpoint for the capture screen.
 *
 * It stores the photo, creates the row and returns immediately — reading a
 * document takes tens of seconds, which is far longer than anyone standing at a
 * counter will hold a page open. The browser polls for status.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "no photos in request" }, { status: 400 });
  }

  const sheets = [];
  for (const file of files) {
    const photo = await save(file);
    const sheet = await db.sheet.create({ data: { photoPath: photo.filename } });
    enqueue(sheet.id);
    sheets.push({ id: sheet.id, status: sheet.status, url: url(photo.filename), uploadedAt: sheet.createdAt });
  }

  return NextResponse.json({ photos: sheets });
}

export async function GET() {
  await recoverInterrupted();

  const sheets = await db.sheet.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { event: { select: { folio: true, kind: true, total: true } } },
  });

  return NextResponse.json({
    photos: sheets.map((s) => ({
      id: s.id,
      status: s.status,
      url: url(s.photoPath),
      uploadedAt: s.createdAt,
      folio: s.event?.folio ?? null,
      kind: s.event?.kind ?? null,
      total: s.event?.total ?? null,
      error: s.error,
    })),
  });
}
