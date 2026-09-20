import type { Config } from "./catalog";
import type { NormalizedSheet } from "./normalize";

/**
 * The deterministic checks. Everything here is arithmetic the model never touches,
 * which is the whole point: a model asked to verify its own sums will adjust a digit
 * until they add up, and an invented number that passes every check is the most
 * expensive failure this system could produce.
 *
 * `blocking` stops a sheet from being committed until a human resolves it.
 * `warning` lets it through but surfaces it. Nothing here corrects anything.
 */

export type FlagCode =
  | "V1" // line: gross − deduction ≠ net
  | "V2" // truck: gross − tare ≠ net
  | "V3" // sum of lines vs truck net, outside tolerance
  | "V4" // amount ≠ net × price, or total ≠ sum of amounts
  | "V5" // material not in the catalog
  | "V6" // unit missing or implausible
  | "V7" // implausible date or weight
  | "V8" // possible duplicate
  | "V9" // illegible field
  | "PRECIO"; // price on the sheet diverges from the catalog

export type Severity = "blocking" | "warning";

export interface Flag {
  code: FlagCode;
  severity: Severity;
  /** 1-based line number, absent when the flag is about the sheet as a whole. */
  line?: number;
  /**
   * Numbers the message needs. Kept structured rather than baked into a string so
   * the same flag renders in Spanish for the yard and English for a reviewer.
   */
  params: Record<string, string | number>;
}

/** Sheets already committed, for duplicate detection. */
export interface PriorSheet {
  dateIso: string | null;
  supplier: string | null;
  plate: string | null;
  linesTotalKg: number | null;
  folio?: string | null;
}

const near = (a: number, b: number, epsilon: number) => Math.abs(a - b) <= epsilon;
const pctDiff = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : Infinity) : Math.abs(a - b) / Math.abs(b));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function validate(
  sheet: NormalizedSheet,
  config: Config,
  priors: PriorSheet[] = [],
  today = new Date(),
): Flag[] {
  const flags: Flag[] = [];
  const add = (code: FlagCode, severity: Severity, params: Flag["params"], line?: number) =>
    flags.push(line == null ? { code, severity, params } : { code, severity, line, params });

  for (const line of sheet.lines) {
    // V9 — illegible. Reported first, because a line nobody can read makes every
    // other check on it meaningless, and no value may be inferred to fill the gap.
    if (line.illegible) {
      add("V9", "blocking", { material: line.materialRaw }, line.index);
      continue;
    }

    // V5 — material resolution. A fuzzy match is a suggestion, never a decision.
    if (line.match === "unknown" || line.match === "missing") {
      add("V5", "blocking", { material: line.materialRaw }, line.index);
    } else if (line.match === "fuzzy") {
      add("V5", "warning", {
        material: line.materialRaw,
        suggestion: line.materialName ?? "",
      }, line.index);
    }

    // V6 — a weight with no unit cannot be converted, so it cannot be trusted.
    if (line.unit == null && line.netKg == null) {
      add("V6", "blocking", { material: line.materialRaw }, line.index);
    }

    // V1 — gross − deduction = net.
    if (line.grossKg != null && line.netKg != null) {
      const deduction = line.deductionKg ?? 0;
      const expected = line.grossKg - deduction;
      if (!near(expected, line.netKg, config.weightEpsilon)) {
        add("V1", "blocking", {
          gross: round2(line.grossKg),
          deduction: round2(deduction),
          written: round2(line.netKg),
          expected: round2(expected),
        }, line.index);
      }
    }

    // V4 — amount = net × price.
    if (line.amount != null && line.netInPriceUnit != null) {
      const price = line.price ?? line.catalogPrice;
      if (price != null) {
        const expected = line.netInPriceUnit * price;
        if (!near(expected, line.amount, config.amountEpsilon)) {
          add("V4", "blocking", {
            written: round2(line.amount),
            expected: round2(expected),
            price,
          }, line.index);
        }
      }
    }

    // PRECIO — the arithmetic is fine but the rate is not the configured one.
    // Usually either a misread digit or a negotiated price; both want a human.
    if (line.price != null && line.catalogPrice != null) {
      if (pctDiff(line.price, line.catalogPrice) * 100 > config.priceDivergencePct) {
        add("PRECIO", "warning", {
          written: line.price,
          catalog: line.catalogPrice,
          material: line.materialName ?? line.materialRaw,
        }, line.index);
      }
    }

    // V7 — a weight of zero or an absurd one is worth a second look.
    if (line.netKg != null && (line.netKg <= 0 || line.netKg > 40_000)) {
      add("V7", "warning", { weight: round2(line.netKg) }, line.index);
    }
  }

  // V2 — the truck scale: gross − tare = net.
  const truck = sheet.truck;
  if (truck?.grossKg != null && truck.tareKg != null && truck.netKg != null) {
    const expected = truck.grossKg - truck.tareKg;
    if (!near(expected, truck.netKg, config.weightEpsilon)) {
      add("V2", "blocking", {
        gross: round2(truck.grossKg),
        tare: round2(truck.tareKg),
        written: round2(truck.netKg),
        expected: round2(expected),
      });
    }
  }

  // V3 — the detail against the truck. Some gap is normal (dirt, moisture, losses
  // while sorting), so this is a tolerance, not an equality. Skipped entirely when
  // there is no truck weight: a walk-in delivery has nothing to compare against.
  if (truck?.netKg != null && sheet.linesTotalKg != null) {
    const diff = pctDiff(sheet.linesTotalKg, truck.netKg) * 100;
    if (diff > config.tolerancePct) {
      add("V3", "blocking", {
        lines: round2(sheet.linesTotalKg),
        truck: round2(truck.netKg),
        diffPct: round2(diff),
        tolerancePct: config.tolerancePct,
      });
    }
  }

  // V4 at sheet level — the written total against the sum of the amounts.
  const amounts = sheet.lines.map((l) => l.amount);
  if (sheet.totalAmount != null && amounts.every((a) => a != null)) {
    const sum = amounts.reduce((s: number, a) => s + a!, 0);
    if (!near(sum, sheet.totalAmount, config.amountEpsilon)) {
      add("V4", "blocking", { written: round2(sheet.totalAmount), expected: round2(sum) });
    }
  }

  // V7 — the date. Unparseable or in the future means the month's reports would be
  // wrong, and a wrong month is harder to notice later than a missing one.
  if (sheet.dateIso == null) {
    add("V7", "blocking", { field: "date" });
  } else {
    const date = new Date(sheet.dateIso + "T00:00:00Z");
    if (date.getTime() > today.getTime()) add("V7", "warning", { field: "date", date: sheet.dateIso });
  }

  // V8 — duplicates. Same day, same supplier, same plate, same total weight is
  // almost always the same sheet photographed twice, or entered twice by hand.
  const duplicate = priors.find(
    (p) =>
      p.dateIso != null &&
      p.dateIso === sheet.dateIso &&
      p.supplier != null &&
      fold(p.supplier) === fold(sheet.supplier ?? "") &&
      fold(p.plate ?? "") === fold(sheet.plate ?? "") &&
      p.linesTotalKg != null &&
      sheet.linesTotalKg != null &&
      near(p.linesTotalKg, sheet.linesTotalKg, config.weightEpsilon),
  );
  if (duplicate) {
    add("V8", "warning", { folio: duplicate.folio ?? "", date: sheet.dateIso ?? "" });
  }

  return flags;
}

export const isBlocking = (flags: Flag[]) => flags.some((f) => f.severity === "blocking");

// Local copy of normalize's folding, kept private so validate.ts has no reason to
// import anything that could pull in heavier machinery.
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
