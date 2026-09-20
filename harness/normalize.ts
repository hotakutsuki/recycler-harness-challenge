import type { Config, Material } from "./catalog";
import type { NumberField, Sheet, Unit } from "./schema";
import { toKg } from "./units";

/**
 * Turns a transcription into comparable numbers: weights in kilograms, materials
 * resolved against the catalog, the date in ISO.
 *
 * Pure, and deliberately free of judgement — it never decides a sheet is wrong,
 * only what its values mean. Deciding is validate.ts's job.
 */

export type MatchKind = "alias" | "fuzzy" | "unknown" | "missing";

export interface NormalizedLine {
  index: number;
  materialRaw: string;
  materialId: string | null;
  materialName: string | null;
  match: MatchKind;
  /** Only set for a fuzzy match: what it matched and how closely, for the UI to show. */
  matchScore?: number;
  unit: Unit | null;
  grossKg: number | null;
  deductionKg: number | null;
  netKg: number | null;
  /** Net weight expressed in the unit the material is priced in. */
  netInPriceUnit: number | null;
  price: number | null;
  /** The catalog price, for comparison against what the sheet says. */
  catalogPrice: number | null;
  amount: number | null;
  /** True when a weight on this line was marked illegible by the model. */
  illegible: boolean;
}

export interface NormalizedSheet {
  dateIso: string | null;
  supplier: string | null;
  plate: string | null;
  folio: string | null;
  truck: { grossKg: number | null; tareKg: number | null; netKg: number | null; unit: Unit | null } | null;
  lines: NormalizedLine[];
  totalNetKg: number | null;
  totalAmount: number | null;
  /** Sum of the line nets, in kg — the number that gets compared with the truck. */
  linesTotalKg: number | null;
}

const val = (f: NumberField | null | undefined): number | null =>
  f && f.legible ? f.value : null;

const isIllegible = (...fields: (NumberField | null | undefined)[]): boolean =>
  fields.some((f) => f != null && !f.legible);

/** Lowercase, strip accents and punctuation, collapse spaces: "Chat. Liv." -> "chat liv". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance, capped by nothing clever — these strings are a few words long. */
function distance(a: string, b: string): number {
  const prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur: number[] = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

/**
 * Resolves what the weigher wrote to a catalog material.
 *
 * Three steps, in order, and the distinction between them matters: an exact alias
 * is trusted silently, a fuzzy match is only ever a *suggestion* that gets flagged
 * for a human, and anything else is unknown. The system never quietly decides that
 * "bronce" was probably meant to be "hierro" — that would put the wrong material in
 * inventory and nobody would ever know.
 */
export function resolveMaterial(
  raw: string,
  materials: Material[],
): { material: Material | null; match: MatchKind; score?: number } {
  const needle = fold(raw);
  if (!needle) return { material: null, match: "missing" };

  for (const m of materials) {
    const candidates = [m.name, ...m.aliases].map(fold);
    if (candidates.includes(needle)) return { material: m, match: "alias" };
  }

  // A written form that is a prefix of the canonical name, word by word:
  // "chat liv" -> "chatarra liviana". Common, and safe enough to suggest.
  const words = needle.split(" ");
  for (const m of materials) {
    const nameWords = fold(m.name).split(" ");
    if (
      words.length === nameWords.length &&
      words.every((w, i) => nameWords[i]!.startsWith(w) && w.length >= 3)
    ) {
      return { material: m, match: "fuzzy", score: 0.9 };
    }
  }

  // Last resort: a near-miss on spelling ("carbon" vs "carton").
  let best: { m: Material; score: number } | null = null;
  for (const m of materials) {
    for (const candidate of [m.name, ...m.aliases].map(fold)) {
      const d = distance(needle, candidate);
      const score = 1 - d / Math.max(needle.length, candidate.length);
      if (!best || score > best.score) best = { m, score };
    }
  }
  if (best && best.score >= 0.8) return { material: best.m, match: "fuzzy", score: best.score };

  return { material: null, match: "unknown" };
}

/**
 * Parses a written date. Returns null whenever the reading would be a guess —
 * an ambiguous day/month ("03/04/26") is worth a human's two seconds, not a
 * coin flip that lands in the wrong month's cash report.
 */
export function parseDate(raw: string | null, today = new Date()): string | null {
  if (!raw) return null;
  const parts = raw.trim().split(/[/\-.\s]+/).filter(Boolean);
  if (parts.length !== 3) return null;

  const [a, b, c] = parts as [string, string, string];
  if (!/^\d{1,2}$/.test(a) || !/^\d{1,2}$/.test(b) || !/^\d{2,4}$/.test(c)) return null;

  const day = Number(a);
  const month = Number(b);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const year = c.length === 2 ? 2000 + Number(c) : Number(c);
  if (year < 2000 || year > today.getFullYear() + 1) return null;

  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(iso + "T00:00:00Z");
  return Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== day ? null : iso;
}

export function normalize(sheet: Sheet, config: Config, today = new Date()): NormalizedSheet {
  const lines = sheet.lines.map((line): NormalizedLine => {
    const { material, match, score } = resolveMaterial(line.material_raw, config.materials);
    const unit = line.unit;

    const gross = val(line.gross);
    const deduction = val(line.deduction);
    const net = val(line.net);

    const kg = (n: number | null) => (n != null && unit ? toKg(n, unit) : null);
    const netKg = kg(net);

    return {
      index: line.index,
      materialRaw: line.material_raw,
      materialId: material?.id ?? null,
      materialName: material?.name ?? null,
      match,
      ...(score != null ? { matchScore: score } : {}),
      unit,
      grossKg: kg(gross),
      deductionKg: kg(deduction),
      netKg,
      netInPriceUnit:
        netKg != null && material ? netKg / toKg(1, material.priceUnit) : null,
      price: val(line.price),
      catalogPrice: material?.price ?? null,
      amount: val(line.amount),
      illegible: isIllegible(line.gross, line.net, line.deduction, line.price, line.amount),
    };
  });

  const netKgs = lines.map((l) => l.netKg);
  const linesTotalKg = netKgs.some((n) => n == null)
    ? null
    : netKgs.reduce((sum: number, n) => sum + n!, 0);

  const truckUnit = sheet.header.truck?.unit ?? null;
  const truckKg = (f: NumberField | null | undefined) => {
    const v = val(f);
    return v != null && truckUnit ? toKg(v, truckUnit) : null;
  };

  return {
    // The model may offer an ISO date, but we re-derive it from the ink: the
    // transcription is what was verified against the photo, not the model's parse.
    dateIso: parseDate(sheet.header.date_raw, today),
    supplier: sheet.header.supplier,
    plate: sheet.header.plate,
    folio: sheet.header.folio,
    truck: sheet.header.truck
      ? {
          grossKg: truckKg(sheet.header.truck.gross),
          tareKg: truckKg(sheet.header.truck.tare),
          netKg: truckKg(sheet.header.truck.net),
          unit: truckUnit,
        }
      : null,
    lines,
    totalNetKg: truckUnit || lines[0]?.unit
      ? (() => {
          const v = val(sheet.total_net);
          const unit = truckUnit ?? lines[0]?.unit ?? null;
          return v != null && unit ? toKg(v, unit) : null;
        })()
      : null,
    totalAmount: val(sheet.total_amount),
    linesTotalKg,
  };
}
