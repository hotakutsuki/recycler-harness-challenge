import { contentType, read } from "./storage";
import { db } from "./db";
import { extractDocument } from "./extractor";
import { check, loadConfig, persist } from "./pipeline";
import { isBlocking } from "@/harness/validate";

/**
 * The worker that reads uploaded photos.
 *
 * It runs in this process, not on a queue. That is enough for one yard and one
 * person at the counter, and it is written down here and in the README rather
 * than dressed up: a production version would use a real queue. What it does
 * take seriously is not losing work — a row left in `extracting` by a restart is
 * put back in the queue at boot.
 */

const CONCURRENCY = 2;
const queue: string[] = [];
let running = 0;
let recovered = false;

export function enqueue(sheetId: string): void {
  queue.push(sheetId);
  pump();
}

function pump(): void {
  while (running < CONCURRENCY && queue.length > 0) {
    const id = queue.shift()!;
    running++;
    void process_(id).finally(() => {
      running--;
      pump();
    });
  }
}

async function process_(sheetId: string): Promise<void> {
  const sheet = await db.sheet.findUnique({ where: { id: sheetId } });
  if (!sheet) return;

  await db.sheet.update({ where: { id: sheetId }, data: { status: "extracting", error: null } });

  try {
    const image = await read(sheet.photoPath);
    if (!image) throw new Error(`photo missing: ${sheet.photoPath}`);

    const config = await loadConfig();
    const { document } = await extractDocument(
      image,
      contentType(sheet.photoPath) as "image/jpeg",
      config,
    );

    const { normalized, flags } = await check(document, sheetId, config);
    await persist(sheetId, normalized);

    await db.sheet.update({
      where: { id: sheetId },
      data: {
        status: isBlocking(flags) ? "needs_review" : "ready",
        rawExtraction: JSON.stringify(document),
        flags: JSON.stringify(flags),
        error: null,
      },
    });
  } catch (error) {
    // A failed read is a sheet a person can retry, not a lost photo. Nothing
    // half-extracted is ever written to the ledger.
    await db.sheet.update({
      where: { id: sheetId },
      data: { status: "failed", error: error instanceof Error ? error.message : String(error) },
    });
  }
}

/** Puts back anything a restart interrupted. Safe to call more than once. */
export async function recoverInterrupted(): Promise<void> {
  if (recovered) return;
  recovered = true;

  const stuck = await db.sheet.findMany({
    where: { status: { in: ["extracting", "queued"] } },
    select: { id: true },
  });
  for (const { id } of stuck) enqueue(id);
}
