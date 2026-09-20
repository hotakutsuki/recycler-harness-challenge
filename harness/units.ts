import type { Unit } from "./schema";

/**
 * Weight conversion. Everything is stored in kilograms internally; the unit the
 * weigher actually wrote is kept alongside so the review screen can show it back.
 *
 * The quintal used in Ecuadorian yards is the "quintal métrico americano" of
 * 100 pounds, not the 46 kg Spanish quintal. Getting this wrong is a ~2 % error
 * on every scrap purchase, which is why it is a named constant with a test.
 */
export const KG_PER_LB = 0.45359237;
export const LB_PER_QQ = 100;

const TO_KG: Record<Unit, number> = {
  kg: 1,
  lb: KG_PER_LB,
  qq: LB_PER_QQ * KG_PER_LB,
  t: 1000,
};

export function toKg(value: number, unit: Unit): number {
  return value * TO_KG[unit];
}

export function fromKg(kg: number, unit: Unit): number {
  return kg / TO_KG[unit];
}

export function convert(value: number, from: Unit, to: Unit): number {
  return fromKg(toKg(value, from), to);
}

/**
 * Parses a number as written by hand: "1.250", "1,250", "1250", "1.250,50".
 *
 * Handwritten sheets mix separators freely — the same weigher writes "1.250" on
 * one line and "1250" on the next — so this cannot assume a locale. The rules:
 *
 *   - the last separator is a decimal point only if 1 or 2 digits follow it
 *     ("1.250,50" → 1250.50, "0,5" → 0.5)
 *   - otherwise every separator is a thousands separator ("1.250" → 1250)
 *
 * Three digits after a separator is the ambiguous case: "1.250" could be 1250 or
 * 1.25 kg. Yard weights are whole units far more often than they are thousandths,
 * so it reads as 1250 — and the sum checks in validate.ts are what catch it when
 * that guess is wrong, rather than this function pretending to be certain.
 */
export function parseWritten(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(cleaned) || !/\d/.test(cleaned)) return null;

  const lastSep = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  let normalized: string;

  if (lastSep === -1) {
    normalized = cleaned;
  } else {
    const decimals = cleaned.length - lastSep - 1;
    if (decimals === 1 || decimals === 2) {
      normalized =
        cleaned.slice(0, lastSep).replace(/[.,]/g, "") + "." + cleaned.slice(lastSep + 1);
    } else {
      normalized = cleaned.replace(/[.,]/g, "");
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
