import type { Config, Material } from "./catalog";
import type { Document, NumberField, Unit } from "./schema";
import { toKg } from "./units";

/**
 * Turns a transcription into comparable numbers: materials resolved against the
 * catalog, weights carrying the unit they are actually in, money as numbers.
 *
 * Pure, and deliberately without judgement — it decides what the ink *means*,
 * never whether it is right. Deciding is validate.ts's job.
 */

export type MatchKind = "alias" | "fuzzy" | "unknown" | "missing";

export interface NormalizedLine {
  index: number;
  materialRaw: string;
  materialId: string | null;
  materialName: string | null;
  match: MatchKind;
  matchScore?: number;
  quantity: number | null;
  /** The unit the quantity is in: written on the document, else the catalog's. */
  unit: Unit | null;
  /** Only set when the unit is known, for reports that add materials together. */
  quantityKg: number | null;
  unitPrice: number | null;
  catalogPrice: number | null;
  priceRange: { min: number; max: number } | null;
  amount: number | null;
  illegible: boolean;
  note: string | null;
}

export interface NormalizedSettlement {
  total: number | null;
  paid: number | null;
  owed: number | null;
  methods: string[];
}

export interface NormalizedDocument {
  kind: "tarjeta" | "comprobante";
  /** Card number or receipt number — what identifies this piece of paper. */
  folio: string | null;
  dateIso: string | null;
  counterparty: string | null;
  lines: NormalizedLine[];
  /** Sum of the line amounts, when every line has one. */
  linesTotal: number | null;
  truck: {
    gross: number | null;
    tare: number | null;
    net: number | null;
    deductions: number;
    finalNet: number | null;
    unit: Unit | null;
  } | null;
  /** Material of the whole load, on a comprobante. */
  bulkMaterialId: string | null;
  bulkMaterialName: string | null;
  bulkMatch: MatchKind | null;
  settlement: NormalizedSettlement;
  illegibleFields: number;
}

const val = (f: NumberField | null | undefined): number | null =>
  f && f.legible ? f.value : null;

const unreadable = (...fields: (NumberField | null | undefined)[]): boolean =>
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
 * Three outcomes, and the difference between them is the point: an exact alias is
 * trusted silently, a fuzzy match is only ever a *suggestion* that gets flagged,
 * and anything else is unknown. "Bronce" must never quietly become "hierro" —
 * that puts the wrong material in inventory and nobody ever finds out.
 *
 * Tags the yard writes after the material ("Radiador ALU", "cobre 1ra") are part
 * of the name here; the catalog carries them as aliases when they matter.
 */
export function resolveMaterial(
  raw: string,
  materials: Material[],
): { material: Material | null; match: MatchKind; score?: number } {
  const needle = fold(raw);
  if (!needle) return { material: null, match: "missing" };

  for (const m of materials) {
    if ([m.name, ...m.aliases].map(fold).includes(needle)) {
      return { material: m, match: "alias" };
    }
  }

  // The written form starts the catalog word, word by word: "grues" -> "gruesa".
  const words = needle.split(" ");
  for (const m of materials) {
    for (const candidate of [m.name, ...m.aliases].map(fold)) {
      const candidateWords = candidate.split(" ");
      if (
        words.length === candidateWords.length &&
        words.every((w, i) => candidateWords[i]!.startsWith(w) && w.length >= 3)
      ) {
        return { material: m, match: "fuzzy", score: 0.9 };
      }
    }
  }

  // A tag after the material name: "radiador alu" -> "radiador".
  const head = words[0]!;
  if (head.length >= 4) {
    for (const m of materials) {
      if ([m.name, ...m.aliases].map(fold).includes(head)) {
        return { material: m, match: "fuzzy", score: 0.85 };
      }
    }
  }

  // Last resort: a near-miss on spelling, which handwriting produces constantly.
  let best: { m: Material; score: number } | null = null;
  for (const m of materials) {
    for (const candidate of [m.name, ...m.aliases].map(fold)) {
      const score = 1 - distance(needle, candidate) / Math.max(needle.length, candidate.length);
      if (!best || score > best.score) best = { m, score };
    }
  }
  if (best && best.score >= 0.75) return { material: best.m, match: "fuzzy", score: best.score };

  return { material: null, match: "unknown" };
}

/**
 * Parses a written date, returning null whenever reading it would be a guess.
 * An ambiguous day/month is worth two seconds of a human's time, not a coin flip
 * that lands in the wrong month's cash report.
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

function normalizeSettlement(
  settlement: Document["settlement"],
): NormalizedSettlement {
  const paid = settlement.payments
    .filter((p) => p.kind !== "debe")
    .map((p) => val(p.amount))
    .filter((n): n is number => n != null);

  const owedFromPayments = settlement.payments
    .filter((p) => p.kind === "debe")
    .map((p) => val(p.amount))
    .filter((n): n is number => n != null);

  return {
    total: val(settlement.total),
    paid: paid.length ? paid.reduce((a, b) => a + b, 0) : null,
    owed: val(settlement.owed) ?? owedFromPayments[0] ?? null,
    methods: settlement.payments.map((p) => p.kind),
  };
}

export function normalize(
  doc: Document,
  config: Config,
  today = new Date(),
): NormalizedDocument {
  const settlement = normalizeSettlement(doc.settlement);
  const dateIso = parseDate(doc.date_raw, today);

  if (doc.kind === "tarjeta") {
    const lines = doc.lines.map((line): NormalizedLine => {
      const { material, match, score } = resolveMaterial(line.material_raw, config.materials);
      const quantity = val(line.quantity);
      const unit = material?.unit ?? null;

      return {
        index: line.index,
        materialRaw: line.material_raw,
        materialId: material?.id ?? null,
        materialName: material?.name ?? null,
        match,
        ...(score != null ? { matchScore: score } : {}),
        quantity,
        unit,
        quantityKg: quantity != null && unit ? toKg(quantity, unit) : null,
        unitPrice: val(line.unit_price),
        catalogPrice: material?.price ?? null,
        priceRange: material?.priceRange ?? null,
        amount: val(line.amount),
        illegible: unreadable(line.quantity, line.unit_price, line.amount),
        note: line.note,
      };
    });

    const amounts = lines.map((l) => l.amount);

    return {
      kind: "tarjeta",
      folio: doc.card_number,
      dateIso,
      counterparty: doc.counterparty,
      lines,
      linesTotal: amounts.every((a) => a != null)
        ? amounts.reduce((sum: number, a) => sum + a!, 0)
        : null,
      truck: null,
      bulkMaterialId: null,
      bulkMaterialName: null,
      bulkMatch: null,
      settlement,
      illegibleFields: lines.filter((l) => l.illegible).length,
    };
  }

  const bulk = doc.material_raw
    ? resolveMaterial(doc.material_raw, config.materials)
    : { material: null, match: "missing" as MatchKind };

  const w = doc.weighing;
  const deductions = w.deductions
    .map((d) => val(d.amount))
    .filter((n): n is number => n != null)
    .reduce((a, b) => a + b, 0);

  return {
    kind: "comprobante",
    folio: doc.receipt_number,
    dateIso,
    counterparty: doc.counterparty,
    lines: [],
    linesTotal: null,
    truck: {
      gross: val(w.gross),
      tare: val(w.tare),
      net: val(w.net),
      deductions,
      finalNet: val(w.final_net) ?? val(w.net),
      unit: w.unit,
    },
    bulkMaterialId: bulk.material?.id ?? null,
    bulkMaterialName: bulk.material?.name ?? null,
    bulkMatch: bulk.match,
    settlement,
    illegibleFields: unreadable(w.gross, w.tare, w.net, w.final_net) ? 1 : 0,
  };
}
