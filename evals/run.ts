import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG } from "../harness/catalog";
import { extractDocument } from "../lib/extractor";
import { normalize } from "../harness/normalize";
import { Document, type NumberField } from "../harness/schema";
import { validate, isBlocking, type Flag } from "../harness/validate";
import { usingStub } from "../lib/extractor";

/**
 * Measures the harness against the 27 hand-transcribed documents.
 *
 * The number this exists for is the **silent error rate**: fields committed
 * with a wrong value and nothing flagged. Everything else on the report is
 * context for it. A harness that misreads loudly is an inconvenience; one that
 * misreads quietly costs a yard money it never finds out about.
 *
 *   npm run eval              # every document
 *   npm run eval -- 5         # the first five, while iterating on the prompt
 */

const DATASET = path.join(process.cwd(), "evals", "dataset");
const REPORT = path.join(process.cwd(), "evals", "REPORT.md");
const limit = Number(process.argv[2] ?? "0");

interface GroundTruth {
  id: string;
  folio: string;
  uncertain: string[];
  extraction: unknown;
}

/** One comparable value, addressed the way it is written on the document. */
interface Field {
  path: string;
  raw: string | null;
  value: number | null;
  legible: boolean;
  /** Set when the document shows this value crossed out and rewritten. */
  replaces: string | null;
}

function flatten(doc: Document): Map<string, Field> {
  const out = new Map<string, Field>();

  const number = (path: string, field: NumberField | null | undefined) => {
    if (field == null) return;
    out.set(path, {
      path,
      raw: field.raw,
      value: field.legible ? field.value : null,
      legible: field.legible,
      replaces: field.replaces,
    });
  };
  const text = (path: string, value: string | null) => {
    if (value == null) return;
    out.set(path, { path, raw: value, value: null, legible: true, replaces: null });
  };

  text("date", doc.date_raw);

  if (doc.kind === "tarjeta") {
    text("folio", doc.card_number);
    doc.lines.forEach((line, i) => {
      text(`line.${i}.material`, line.material_raw);
      number(`line.${i}.quantity`, line.quantity);
      number(`line.${i}.price`, line.unit_price);
      number(`line.${i}.amount`, line.amount);
    });
  } else {
    text("folio", doc.receipt_number);
    text("material", doc.material_raw);
    number("truck.gross", doc.weighing.gross);
    number("truck.tare", doc.weighing.tare);
    number("truck.net", doc.weighing.net);
    number("truck.final", doc.weighing.final_net);
    doc.weighing.deductions.forEach((d, i) => number(`deduction.${i}`, d.amount));
  }

  number("total", doc.settlement.total);
  number("owed", doc.settlement.owed);
  doc.settlement.payments.forEach((p, i) => number(`payment.${i}`, p.amount));

  return out;
}

type Verdict = "match" | "wrong" | "missed" | "invented";

/**
 * Compares one field. Numbers are compared as numbers, so a model that writes
 * "1250" where the paper says "1.250" is right — it read the digits correctly
 * and the separator is a convention. Text is compared case- and accent-folded,
 * because "Chatarra" and "chatarra" are the same material to everyone involved.
 */
function compare(truth: Field, got: Field | undefined): Verdict {
  const fold = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

  if (truth.value != null) {
    if (got == null || got.value == null) return "missed";
    return Math.abs(got.value - truth.value) < 0.005 ? "match" : "wrong";
  }
  if (!truth.legible) {
    // The paper is unreadable here. Saying so is right; producing a number is
    // the worst answer available, and it is counted as one.
    return got == null || !got.legible ? "match" : "invented";
  }
  if (truth.raw == null) return "match";
  if (got == null || got.raw == null) return "missed";
  return fold(got.raw) === fold(truth.raw) ? "match" : "wrong";
}

interface DocResult {
  id: string;
  folio: string;
  kindCorrect: boolean;
  counts: Record<Verdict, number>;
  wrongFields: string[];
  corrections: { total: number; right: number };
  flagsTruth: string[];
  flagsGot: string[];
  silent: boolean;
  seconds: number;
  tokens: { input: number; output: number };
  error?: string;
}

async function evaluate(record: GroundTruth): Promise<DocResult> {
  const truthDoc = Document.parse(record.extraction);
  const truthFields = flatten(truthDoc);
  const truthFlags = validate(normalize(truthDoc, DEFAULT_CONFIG), DEFAULT_CONFIG).map((f) => f.code);

  const base: DocResult = {
    id: record.id,
    folio: record.folio,
    kindCorrect: false,
    counts: { match: 0, wrong: 0, missed: 0, invented: 0 },
    wrongFields: [],
    corrections: { total: 0, right: 0 },
    flagsTruth: truthFlags,
    flagsGot: [],
    silent: false,
    seconds: 0,
    tokens: { input: 0, output: 0 },
  };

  const started = Date.now();
  let got;
  try {
    const image = fs.readFileSync(path.join(DATASET, "fotos", `${record.id}.jpeg`));
    got = await extractDocument(image, "image/jpeg", DEFAULT_CONFIG);
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
  const seconds = (Date.now() - started) / 1000;

  const gotFields = flatten(got.document);
  const gotFlags = validate(normalize(got.document, DEFAULT_CONFIG), DEFAULT_CONFIG);

  const counts = { ...base.counts };
  const wrongFields: string[] = [];
  for (const [path, truth] of truthFields) {
    const verdict = compare(truth, gotFields.get(path));
    counts[verdict]++;
    if (verdict !== "match") wrongFields.push(`${path} (${verdict})`);
  }

  // Fields the model reported that the document does not have at all.
  for (const path of gotFields.keys()) {
    if (!truthFields.has(path)) {
      counts.invented++;
      wrongFields.push(`${path} (invented)`);
    }
  }

  // Crossed-out values: did it read the correction or the abandoned figure?
  let correctionsTotal = 0;
  let correctionsRight = 0;
  for (const [path, truth] of truthFields) {
    if (!truth.replaces) continue;
    correctionsTotal++;
    if (compare(truth, gotFields.get(path)) === "match") correctionsRight++;
  }

  const wrong = counts.wrong + counts.missed + counts.invented;

  return {
    ...base,
    kindCorrect: got.document.kind === truthDoc.kind,
    counts,
    wrongFields,
    corrections: { total: correctionsTotal, right: correctionsRight },
    flagsGot: gotFlags.map((f) => f.code),
    // The headline: something is wrong and nothing stops it being committed.
    silent: wrong > 0 && !isBlocking(gotFlags),
    seconds,
    tokens: { input: got.usage.inputTokens, output: got.usage.outputTokens },
  };
}

function markdown(results: DocResult[]): string {
  const ok = results.filter((r) => !r.error);
  const sum = (pick: (r: DocResult) => number) => ok.reduce((s, r) => s + pick(r), 0);

  const fields = sum((r) => r.counts.match + r.counts.wrong + r.counts.missed + r.counts.invented);
  const matched = sum((r) => r.counts.match);
  const silent = ok.filter((r) => r.silent);
  const corrections = sum((r) => r.corrections.total);
  const correctionsRight = sum((r) => r.corrections.right);

  const missedFlags = ok.filter((r) => r.flagsTruth.some((f) => !r.flagsGot.includes(f)));
  const falseFlags = ok.filter((r) => r.flagsGot.some((f) => !r.flagsTruth.includes(f)));

  const pct = (n: number, of: number) => (of === 0 ? "—" : `${((n / of) * 100).toFixed(1)} %`);

  const lines = [
    "# Evaluation report",
    "",
    `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} · ${ok.length} documents` +
      (results.length !== ok.length ? ` (${results.length - ok.length} failed to extract)` : ""),
    "",
  ];

  if (usingStub()) {
    lines.push(
      "> **Stub mode.** The reading was replayed from this same ground truth, so every",
      "> number below is 100 % by construction. This run measures the evaluation",
      "> harness, not the model. Set a funded `ANTHROPIC_API_KEY` and unset",
      "> `EXTRACTOR` for numbers that mean something.",
      "",
    );
  }

  lines.push(
    "## Headline",
    "",
    "| | |",
    "|---|---|",
    `| **Silent error rate** — a wrong value with nothing flagged | **${pct(silent.length, ok.length)}** (${silent.length} of ${ok.length}) |`,
    `| Field accuracy | ${pct(matched, fields)} (${matched} of ${fields}) |`,
    `| Document type read correctly | ${pct(ok.filter((r) => r.kindCorrect).length, ok.length)} |`,
    `| Crossed-out values read as the correction | ${pct(correctionsRight, corrections)} (${correctionsRight} of ${corrections}) |`,
    `| Documents where a check was missed | ${missedFlags.length} |`,
    `| Documents flagged for nothing | ${falseFlags.length} |`,
    `| Average time per document | ${(sum((r) => r.seconds) / Math.max(ok.length, 1)).toFixed(1)} s |`,
    `| Tokens | ${sum((r) => r.tokens.input)} in · ${sum((r) => r.tokens.output)} out |`,
    "",
    "A silent error is the one that costs money: the value is wrong and nothing",
    "stops it reaching the ledger. A wrong value that raises a check is a minor",
    "inconvenience — somebody looks at the photo and fixes it.",
    "",
    "## Per document",
    "",
    "| Document | Type | Fields right | Wrong | Flags expected | Flags raised | Silent |",
    "|---|---|---|---|---|---|---|",
  );

  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.id} | — | — | — | — | — | extraction failed: ${r.error.slice(0, 60)} |`);
      continue;
    }
    const total = r.counts.match + r.counts.wrong + r.counts.missed + r.counts.invented;
    lines.push(
      `| ${r.id} (${r.folio}) | ${r.kindCorrect ? "ok" : "**wrong**"} | ${r.counts.match}/${total} |` +
        ` ${r.wrongFields.slice(0, 3).join(", ") || "—"} | ${r.flagsTruth.join(", ") || "—"} |` +
        ` ${r.flagsGot.join(", ") || "—"} | ${r.silent ? "**yes**" : "no"} |`,
    );
  }

  lines.push(
    "",
    "## How to read this",
    "",
    "- **wrong** — a value was read as a different value.",
    "- **missed** — the paper has a value and the model returned none, or called it illegible.",
    "- **invented** — the model produced a value the paper does not have. On a field",
    "  the ground truth marks illegible, this is the failure mode the prompt works",
    "  hardest to prevent: a plausible number where the ink is unreadable.",
    "- **Flags expected** are what the checks raise against a perfect transcription;",
    "  **flags raised** are what they raise against the model's. A flag appearing in",
    "  one column only is worth looking at in either direction.",
    "",
  );

  return lines.join("\n");
}

async function main() {
  const records: GroundTruth[] = fs
    .readdirSync(DATASET)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(DATASET, f), "utf8")) as GroundTruth);

  if (!usingStub() && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "no ANTHROPIC_API_KEY set. Run `npm run eval:stub` to check the runner, or export a funded key to measure the model.",
    );
    process.exit(1);
  }

  const chosen = limit > 0 ? records.slice(0, limit) : records;
  console.log(`evaluating ${chosen.length} documents${usingStub() ? " (stub mode — measures the runner, not the model)" : ""}\n`);

  const results: DocResult[] = [];
  for (const record of chosen) {
    const result = await evaluate(record);
    results.push(result);

    const total =
      result.counts.match + result.counts.wrong + result.counts.missed + result.counts.invented;
    console.log(
      `  ${result.id}  ${result.error ? `failed: ${result.error.slice(0, 50)}` : `${result.counts.match}/${total} fields` + (result.silent ? "  SILENT ERROR" : "")}`,
    );
  }

  const report = markdown(results);
  fs.writeFileSync(REPORT, report);

  const ok = results.filter((r) => !r.error);
  const silent = ok.filter((r) => r.silent).length;
  console.log(`\nsilent errors: ${silent} of ${ok.length} documents`);
  console.log(`report written to ${path.relative(process.cwd(), REPORT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
