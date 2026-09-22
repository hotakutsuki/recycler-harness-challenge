import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG } from "../harness/catalog";
import { normalize } from "../harness/normalize";
import { Document } from "../harness/schema";
import { validate, type PriorDocument } from "../harness/validate";
import { describe as describeFlag } from "../harness/messages";
import { translator } from "../lib/i18n";

/**
 * Runs the checks over the ground truth and prints what each document raises.
 *
 * No model involved: this asks whether the checks behave sensibly on a perfect
 * transcription. Anything flagged here is either a real error on the paper or a
 * check that is too strict — both worth knowing before measuring extraction.
 */
const DATASET = path.join(__dirname, "dataset");
const OUT = process.argv[2] ?? null;
const t = translator("en");

interface GroundTruth {
  id: string;
  folio: string;
  uncertain: string[];
  extraction: unknown;
}

const records: GroundTruth[] = fs
  .readdirSync(DATASET)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(DATASET, f), "utf8")) as GroundTruth);

const priors: PriorDocument[] = [];
const report: { [id: string]: string[] } = {};
let clean = 0;

for (const record of records) {
  const doc = normalize(Document.parse(record.extraction), DEFAULT_CONFIG);
  const flags = validate(doc, DEFAULT_CONFIG, [...priors]);
  priors.push({ kind: doc.kind, folio: doc.folio, dateIso: doc.dateIso, total: doc.settlement.total });

  report[record.id] = flags.map((f) => {
    const { text, where, severity } = describeFlag(f, t);
    return `${f.code} · ${severity}${where ? ` · ${where}` : ""} — ${text}`;
  });

  if (flags.length === 0) clean++;
  console.log(
    `${record.id}  ${flags.length === 0 ? "clean" : flags.map((f) => f.code).join(", ")}`,
  );
}

console.log(`\n${clean} of ${records.length} raise nothing at all.`);
if (OUT) {
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`flags written to ${OUT}`);
}
