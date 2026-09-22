import "dotenv/config";
import { db } from "../lib/db";
import { applyRetention } from "../lib/retention";

/**
 * Run from cron. There is no scheduler in the app itself, and pretending
 * otherwise would be the kind of claim this project keeps refusing to make.
 *
 *   0 3 * * *  cd /app && npm run retention
 */
const dryRun = process.argv.includes("--dry");

applyRetention({ dryRun })
  .then(({ retentionDays, deleted, failed, dryRun: dry }) => {
    console.log(`retention window: ${retentionDays} days${dry ? " (dry run)" : ""}`);
    for (const sheet of deleted) {
      console.log(`  ${dry ? "would delete" : "deleted"} ${sheet.photoPath} (${sheet.ageDays} days old)`);
    }
    for (const failure of failed) console.log(`  failed ${failure.id}: ${failure.error}`);
    console.log(
      `${deleted.length} photo${deleted.length === 1 ? "" : "s"} ${dry ? "eligible" : "deleted"}` +
        `, extractions kept`,
    );
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
