import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../lib/db";

/**
 * Empties the documents and their photos, keeping the catalog and settings.
 *
 * Needed after `npm run demo`, which fills the inbox with the sample set: once
 * it is loaded there is nothing left to try an upload against.
 *
 *   npm run reset
 */
async function main() {
  const sheets = await db.sheet.count();
  // Events, lines and corrections go with the sheet: the schema cascades.
  await db.sheet.deleteMany({});

  const uploads = path.join(process.env.DATA_DIR ?? "./data", "uploads");
  let photos = 0;
  try {
    const files = await fs.readdir(uploads);
    for (const file of files) {
      await fs.rm(path.join(uploads, file), { force: true });
      photos++;
    }
  } catch {
    /* nothing uploaded yet */
  }

  console.log(`removed ${sheets} document${sheets === 1 ? "" : "s"} and ${photos} photo${photos === 1 ? "" : "s"}`);
  console.log("materials, prices and settings kept — run `npm run db:reset` to clear those too");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
