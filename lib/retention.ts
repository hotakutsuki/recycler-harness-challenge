import { db } from "./db";
import { loadConfig } from "./pipeline";
import { remove } from "./storage";

/**
 * Deletes photographs once they are past the retention window.
 *
 * What goes and what stays is the whole design here: the **photo** is deleted,
 * the **extraction is kept**. The photo is a picture of a supplier's paperwork
 * sitting on a phone-sized server; the extraction is the yard's own accounting.
 * Keeping the first for ever is a liability nobody asked for, and throwing away
 * the second would destroy the audit trail.
 *
 * Only committed documents are eligible. A sheet still waiting for a person
 * needs its photo — that is the only way to check what the model read.
 *
 * There is no scheduler in this repo. It is a script, run from cron or by hand:
 *
 *   npm run retention            # delete what is past the window
 *   npm run retention -- --dry   # list what would go, delete nothing
 */

export interface Expired {
  id: string;
  photoPath: string;
  committedAt: Date;
  ageDays: number;
}

/** Which sheets are past the window. Pure, so the arithmetic can be tested. */
export function expired(
  sheets: { id: string; photoPath: string; committedAt: Date | null; photoDeletedAt: Date | null }[],
  retentionDays: number,
  now = new Date(),
): Expired[] {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;

  return sheets
    .filter((s) => s.committedAt != null && s.photoDeletedAt == null)
    .filter((s) => s.committedAt!.getTime() < cutoff)
    .map((s) => ({
      id: s.id,
      photoPath: s.photoPath,
      committedAt: s.committedAt!,
      ageDays: Math.floor((now.getTime() - s.committedAt!.getTime()) / (24 * 60 * 60 * 1000)),
    }));
}

export interface RetentionResult {
  retentionDays: number;
  deleted: Expired[];
  failed: { id: string; error: string }[];
  dryRun: boolean;
}

export async function applyRetention({ dryRun = false } = {}): Promise<RetentionResult> {
  const config = await loadConfig();
  const sheets = await db.sheet.findMany({
    where: { status: "committed", photoDeletedAt: null },
    select: { id: true, photoPath: true, committedAt: true, photoDeletedAt: true },
  });

  const due = expired(sheets, config.photoRetentionDays);
  const deleted: Expired[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const sheet of due) {
    if (dryRun) {
      deleted.push(sheet);
      continue;
    }
    try {
      await remove(sheet.photoPath);
      // Marked deleted even if the file was already gone: the record is about
      // whether the photo still exists, not about whether we did the deleting.
      await db.sheet.update({ where: { id: sheet.id }, data: { photoDeletedAt: new Date() } });
      deleted.push(sheet);
    } catch (error) {
      failed.push({ id: sheet.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { retentionDays: config.photoRetentionDays, deleted, failed, dryRun };
}
