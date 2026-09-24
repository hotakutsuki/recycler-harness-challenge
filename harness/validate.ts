import { roundCash, type Config } from "./catalog";
import type { NormalizedDocument } from "./normalize";

/**
 * The deterministic checks — arithmetic the model never touches.
 *
 * That separation is the whole design. A model asked to verify its own sums will
 * adjust a digit until they add up, and an invented number that passes every
 * check is the most expensive failure this system could produce. Addition in
 * TypeScript has no such incentive.
 *
 * `blocking` stops a document from being committed until a person resolves it.
 * `warning` lets it through but surfaces it. Nothing here ever corrects anything.
 */

export type FlagCode =
  | "V1" // line: amount ≠ quantity × price
  | "V2" // truck: entero − solo camión ≠ neto
  | "V3" // truck: neto − deductions ≠ final weight
  | "V4" // total ≠ sum of the lines
  | "V5" // material not in the catalog
  | "V6" // settlement does not balance: total − paid ≠ owed
  | "V7" // implausible date or weight
  | "V8" // possible duplicate
  | "V9" // illegible field
  | "V10" // a total with nothing weighed to back it
  | "V11" // the date disagrees with the neighbouring folios
  | "PRECIO"; // price outside the band this material trades in

export type Severity = "blocking" | "warning";

export interface Flag {
  code: FlagCode;
  severity: Severity;
  /** 1-based line number; absent when the flag is about the document as a whole. */
  line?: number;
  /** Structured so the same flag renders in Spanish for the yard and English for a reviewer. */
  params: Record<string, string | number>;
}

/** Documents already committed, for duplicate detection. */
export interface PriorDocument {
  kind: string;
  folio: string | null;
  dateIso: string | null;
  total: number | null;
}

const near = (a: number, b: number, epsilon: number) => Math.abs(a - b) <= epsilon;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function validate(
  doc: NormalizedDocument,
  config: Config,
  priors: PriorDocument[] = [],
  today = new Date(),
): Flag[] {
  const flags: Flag[] = [];
  const add = (code: FlagCode, severity: Severity, params: Flag["params"], line?: number) =>
    flags.push(line == null ? { code, severity, params } : { code, severity, line, params });

  // ---- lines on a tarjeta -------------------------------------------------
  for (const line of doc.lines) {
    if (line.illegible) {
      // Reported alone: a line nobody can read makes every other check on it
      // meaningless, and no value may be inferred to fill the gap.
      add("V9", "blocking", { material: line.materialRaw }, line.index);
      continue;
    }

    if (line.match === "unknown" || line.match === "missing") {
      add("V5", "blocking", { material: line.materialRaw }, line.index);
    } else if (line.match === "fuzzy") {
      add("V5", "warning", { material: line.materialRaw, suggestion: line.materialName ?? "" }, line.index);
    }

    // V1 — the line's own arithmetic, with the counter's rounding rule applied.
    if (line.amount != null && line.quantity != null && line.unitPrice != null) {
      const expected = roundCash(line.quantity * line.unitPrice, config.cashRounding);
      if (!near(expected, line.amount, config.amountEpsilon)) {
        add("V1", "blocking", {
          quantity: line.quantity,
          price: line.unitPrice,
          expected: round2(expected),
          written: round2(line.amount),
        }, line.index);
      }
    }

    // PRECIO on a line that states an amount but no unit price. Those lines
    // have no arithmetic to check — and that is exactly where a misread
    // quantity hides: "0,5" read as "05" turns half a kilo of copper into
    // five, and every check passes because there is nothing to multiply. The
    // price the line implies is the only handle, and it is a strong one.
    if (line.unitPrice == null && line.priceRange && line.amount != null && line.quantity) {
      const implied = line.amount / line.quantity;
      if (implied < line.priceRange.min || implied > line.priceRange.max) {
        add("PRECIO", "warning", {
          material: line.materialName ?? line.materialRaw,
          written: round2(implied),
          min: line.priceRange.min,
          max: line.priceRange.max,
        }, line.index);
      }
    }

    // PRECIO — the arithmetic can be perfect and the rate still be wrong. Prices
    // here are negotiated per load, so this is a band, not an equality.
    if (line.unitPrice != null && line.priceRange) {
      if (line.unitPrice < line.priceRange.min || line.unitPrice > line.priceRange.max) {
        add("PRECIO", "warning", {
          material: line.materialName ?? line.materialRaw,
          written: line.unitPrice,
          min: line.priceRange.min,
          max: line.priceRange.max,
        }, line.index);
      }
    }

    if (line.quantity != null && line.quantity <= 0) {
      add("V7", "warning", { field: "quantity", value: line.quantity }, line.index);
    }
  }

  // V4 — the written total against the sum of the lines.
  if (doc.settlement.total != null && doc.linesTotal != null) {
    if (!near(doc.settlement.total, doc.linesTotal, config.amountEpsilon)) {
      add("V4", "blocking", {
        written: round2(doc.settlement.total),
        expected: round2(doc.linesTotal),
      });
    }
  }

  // ---- the truck weighing on a comprobante --------------------------------
  const truck = doc.truck;
  if (truck) {
    if (doc.bulkMatch === "unknown" || doc.bulkMatch === "missing") {
      add("V5", "blocking", { material: doc.bulkMaterialName ?? "" });
    }

    // V2 — entero − solo camión = neto.
    if (truck.gross != null && truck.tare != null && truck.net != null) {
      const expected = truck.gross - truck.tare;
      if (!near(expected, truck.net, config.weightEpsilon)) {
        add("V2", "blocking", {
          gross: truck.gross,
          tare: truck.tare,
          expected: round2(expected),
          written: truck.net,
        });
      }
    }

    // V3 — neto − deductions = the weight actually paid for.
    if (truck.net != null && truck.deductions > 0 && truck.finalNet != null) {
      const expected = truck.net - truck.deductions;
      if (!near(expected, truck.finalNet, config.weightEpsilon)) {
        add("V3", "blocking", {
          net: truck.net,
          deductions: round2(truck.deductions),
          expected: round2(expected),
          written: truck.finalNet,
        });
      }
    }

    // PRECIO — a comprobante never states a unit price, so the only handle on
    // whether the total is sane is the price it implies. Outside the band the
    // yard trades in, a human should look before the money leaves the till.
    const weight = truck.finalNet;
    if (doc.settlement.total != null && weight != null && weight > 0) {
      const implied = doc.settlement.total / weight;
      const { min, max } = config.bulkPriceRange;
      if (implied < min || implied > max) {
        add("PRECIO", "warning", {
          material: doc.bulkMaterialName ?? "",
          written: round2(implied),
          min,
          max,
        });
      }
    }

    if (truck.gross != null && truck.tare != null && truck.gross <= truck.tare) {
      add("V7", "warning", { field: "truck", value: truck.gross });
    }
  }

  // ---- what was actually paid --------------------------------------------
  // The yard often pays part now and carries the rest: "850,15 − 500 efect = 350",
  // "Debo 596,25". Recording only the purchase total would leave the cash report
  // wrong on both the day of the purchase and the day the debt is cleared.
  const { total, paid, owed } = doc.settlement;
  if (total != null && paid != null && owed != null) {
    if (!near(total - paid, owed, config.settlementEpsilon)) {
      add("V6", "blocking", {
        total: round2(total),
        paid: round2(paid),
        expected: round2(total - paid),
        written: round2(owed),
      });
    }
  }
  if (total != null && paid != null && owed == null && paid > total + config.amountEpsilon) {
    add("V6", "warning", { total: round2(total), paid: round2(paid) });
  }

  // A balance larger than the purchase cannot be what is left of that purchase:
  // it is the supplier's running account, written in the same margin. Reading it
  // as this document's remainder would overstate the day's outstanding cash, so
  // it is surfaced rather than quietly added up.
  if (total != null && owed != null && owed > total + config.amountEpsilon) {
    add("V6", "warning", { total: round2(total), owed: round2(owed), accumulated: 1 });
  }

  // ---- the document as a whole -------------------------------------------
  if (doc.settlement.total == null) {
    if (doc.linesTotal != null) {
      // A one-line tarjeta often carries no separate total: the line's amount is
      // the total. Worth surfacing, since it is money, but not worth blocking —
      // a check that stops honest paperwork teaches people to click through.
      add("V4", "warning", { expected: round2(doc.linesTotal) });
    } else {
      add("V9", "blocking", { field: "total" });
    }
  }

  if (doc.dateIso == null) {
    add("V7", "blocking", { field: "date" });
  } else {
    const date = new Date(doc.dateIso + "T00:00:00Z").getTime();
    const months = (today.getTime() - date) / (30 * 24 * 60 * 60 * 1000);
    if (months < 0) {
      add("V7", "warning", { field: "date", date: doc.dateIso });
    } else if (months > config.staleDateMonths) {
      // A misread year is invisible to every other check — 2016 for 2026 adds
      // up perfectly — and it files the purchase in a year nobody will look at.
      // The model did misread one, and said so in its own notes; nothing else
      // here would have noticed.
      add("V7", "warning", { field: "oldDate", date: doc.dateIso, months: Math.round(months) });
    }
  }

  if (doc.illegibleFields > 0 && !flags.some((f) => f.code === "V9")) {
    add("V9", "blocking", { field: "weights" });
  }

  // V10 — a total with nothing measured behind it. On a tarjeta every line has
  // a quantity; on a comprobante there is a weight. A document that says money
  // changed hands but records nothing weighed is either badly read or badly
  // written, and either way somebody has to look at the paper.
  const measured =
    doc.lines.some((l) => l.quantity != null) ||
    (truck != null &&
      [truck.gross, truck.tare, truck.net, truck.finalNet].some((w) => w != null));
  // An illegible weight is still a weight: V9 already sends that document to a
  // person, and two flags for one problem trains people to skim them.
  const somethingUnreadable = doc.illegibleFields > 0 || doc.lines.some((l) => l.illegible);
  if (doc.settlement.total != null && !measured && !somethingUnreadable) {
    add("V10", "blocking", { total: round2(doc.settlement.total) });
  }

  // V8 — the folio is pre-printed and never repeats, so the same number twice is
  // the same piece of paper photographed twice.
  const duplicate = priors.find(
    (p) => p.kind === doc.kind && p.folio != null && p.folio === doc.folio,
  );
  if (duplicate) {
    add("V8", "warning", { folio: doc.folio ?? "", date: duplicate.dateIso ?? "" });
  }

  // V11 — the folio is pre-printed and used in order, so the receipts either
  // side of this one were written around the same time. When they agree with
  // each other and this one does not, the day is worth a second look.
  //
  // This came from a misread day (10 for 18) that every other check passed and
  // that files a purchase on the wrong day's cash report. It is a warning, not
  // a block: the real paper does contain a genuine outlier — receipt 015642 is
  // dated a month before its neighbours — and a check that refuses to accept
  // reality is a check people learn to bypass.
  const folioNumber = Number(doc.folio);
  if (doc.dateIso && Number.isFinite(folioNumber) && doc.folio) {
    const neighbours = priors
      .filter((p) => p.kind === doc.kind && p.dateIso && Number.isFinite(Number(p.folio)))
      .map((p) => ({ distance: Math.abs(Number(p.folio) - folioNumber), dateIso: p.dateIso! }))
      .filter((p) => p.distance > 0 && p.distance <= 3)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    const agree = neighbours.length >= 2 && new Set(neighbours.map((n) => n.dateIso)).size === 1;
    if (agree) {
      const theirs = new Date(neighbours[0]!.dateIso + "T00:00:00Z").getTime();
      const ours = new Date(doc.dateIso + "T00:00:00Z").getTime();
      const days = Math.abs(ours - theirs) / (24 * 60 * 60 * 1000);
      if (days > config.folioDateSlackDays) {
        add("V11", "warning", { date: doc.dateIso, neighbours: neighbours[0]!.dateIso });
      }
    }
  }

  return flags;
}

export const isBlocking = (flags: Flag[]) => flags.some((f) => f.severity === "blocking");
