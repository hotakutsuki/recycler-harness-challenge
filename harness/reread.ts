import type { Config } from "./catalog";
import type { Document, NumberField } from "./schema";
import type { Flag } from "./validate";

/**
 * The second reading.
 *
 * When a check fails there are two explanations and the system cannot tell them
 * apart: the paper is wrong, or the reading is. So the failing fields are read
 * again — and the one thing the second pass must never be told is which answer
 * would make the arithmetic work.
 *
 * That restraint is the whole point. "The sums don't match, try again" is an
 * instruction to produce a number that satisfies the check, and a model can
 * always find one. It would pass every validation and be false, which is the
 * single most expensive failure available to this system. So the re-read gets
 * the same prompt as the first pass plus a list of *which* fields to look at,
 * never a target.
 *
 * What the two readings mean:
 *
 *   they agree      the reading is probably right and the paper is probably
 *                   wrong — which happens often, and is worth telling the
 *                   reviewer, because it changes what they look for
 *   they disagree   the reading is the suspect; the reviewer is shown both and
 *                   decides from the photo
 */

/** Which fields the second pass should look at, phrased for the prompt. */
export function focusFor(flags: Flag[]): string | null {
  const wanted = new Set<string>();

  for (const flag of flags) {
    if (flag.severity !== "blocking") continue;
    switch (flag.code) {
      case "V1":
        wanted.add(`the quantity, unit price and amount on line ${flag.line}`);
        break;
      case "V2":
        wanted.add("the three truck weights (entero, solo camión, neto)");
        break;
      case "V3":
        wanted.add("the deduction and the weight left after it");
        break;
      case "V4":
        wanted.add("the total at the foot of the document, and every line amount");
        break;
      case "V5":
        wanted.add(flag.line ? `the material written on line ${flag.line}` : "the material");
        break;
      case "V6":
        wanted.add("the total, what was paid, and any balance still owed");
        break;
      case "V7":
        wanted.add("the date");
        break;
      case "V9":
        wanted.add(
          flag.line
            ? `line ${flag.line}, where a value looked unreadable`
            : "the values that looked unreadable",
        );
        break;
      default:
        break;
    }
  }

  return wanted.size ? [...wanted].join("; ") : null;
}

export interface Disagreement {
  path: string;
  first: string;
  second: string;
}

const show = (field: NumberField | null | undefined): string =>
  field == null ? "—" : field.legible ? field.raw : "(illegible)";

/**
 * Where the two readings differ. Compared on the parsed value, not the ink: a
 * pass that writes "1250" where the other wrote "1.250" read the same digits.
 */
export function compareReadings(first: Document, second: Document): Disagreement[] {
  const out: Disagreement[] = [];

  const both = (path: string, a: NumberField | null | undefined, b: NumberField | null | undefined) => {
    const av = a?.legible ? a.value : null;
    const bv = b?.legible ? b.value : null;
    if (av == null && bv == null) return;
    if (av != null && bv != null && Math.abs(av - bv) < 0.005) return;
    out.push({ path, first: show(a), second: show(b) });
  };

  const text = (path: string, a: string | null, b: string | null) => {
    const fold = (s: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    if (fold(a) !== fold(b)) out.push({ path, first: a ?? "—", second: b ?? "—" });
  };

  if (first.kind !== second.kind) {
    out.push({ path: "document type", first: first.kind, second: second.kind });
    return out;
  }

  text("date", first.date_raw, second.date_raw);

  if (first.kind === "tarjeta" && second.kind === "tarjeta") {
    const lines = Math.max(first.lines.length, second.lines.length);
    for (let i = 0; i < lines; i++) {
      const a = first.lines[i];
      const b = second.lines[i];
      if (!a || !b) {
        out.push({ path: `line ${i + 1}`, first: a ? a.material_raw : "—", second: b ? b.material_raw : "—" });
        continue;
      }
      text(`line ${i + 1} material`, a.material_raw, b.material_raw);
      both(`line ${i + 1} quantity`, a.quantity, b.quantity);
      both(`line ${i + 1} price`, a.unit_price, b.unit_price);
      both(`line ${i + 1} amount`, a.amount, b.amount);
    }
  }

  if (first.kind === "comprobante" && second.kind === "comprobante") {
    both("entero (E)", first.weighing.gross, second.weighing.gross);
    both("solo camión (S)", first.weighing.tare, second.weighing.tare);
    both("neto (N)", first.weighing.net, second.weighing.net);
    both("weight paid for", first.weighing.final_net, second.weighing.final_net);
    const deductions = Math.max(first.weighing.deductions.length, second.weighing.deductions.length);
    for (let i = 0; i < deductions; i++) {
      both(`deduction ${i + 1}`, first.weighing.deductions[i]?.amount, second.weighing.deductions[i]?.amount);
    }
  }

  both("total", first.settlement.total, second.settlement.total);
  both("still owed", first.settlement.owed, second.settlement.owed);

  return out;
}

export interface RereadResult {
  /** Null when nothing blocking needed a second look. */
  focus: string | null;
  agreed: boolean;
  disagreements: Disagreement[];
  second: Document | null;
  error?: string;
}

export type Reader = (focus: string) => Promise<Document>;

/**
 * Runs the second pass when, and only when, something blocking is open.
 * Warnings do not earn a second call: they are for a human to glance at, and a
 * re-read costs a model call on every document that has a price slightly off.
 */
export async function reread(
  first: Document,
  flags: Flag[],
  read: Reader,
  _config?: Config,
): Promise<RereadResult> {
  const focus = focusFor(flags);
  if (!focus) return { focus: null, agreed: true, disagreements: [], second: null };

  try {
    const second = await read(focus);
    const disagreements = compareReadings(first, second);
    return { focus, agreed: disagreements.length === 0, disagreements, second };
  } catch (error) {
    return {
      focus,
      agreed: false,
      disagreements: [],
      second: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
