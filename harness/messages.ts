import type { Flag } from "./validate";

/**
 * Turns a flag into a sentence a person can act on.
 *
 * validate.ts deliberately returns structured flags rather than strings, so the
 * same flag renders in Spanish for the yard and in English for a reviewer. It also
 * means the wording can be rewritten — and it will be, because the first version of
 * a message like this is never the one people understand — without touching the
 * checks themselves.
 *
 * The rule for the wording: say what the sheet says, say what the arithmetic says,
 * and stop. Never tell the person what the answer is, because the system does not
 * know; the paper might be right and the reading wrong, or the other way around.
 */
export function messageKey(flag: Flag): string {
  if (flag.code === "V5" && flag.severity === "warning") return "flag.V5.fuzzy";
  if (flag.code === "V7" && flag.params.field === "date") return "flag.V7.date";
  if (flag.code === "V9" && flag.params.field === "total") return "flag.V9.total";
  if (flag.code === "V9" && flag.params.field === "weights") return "flag.V9.weights";
  if (flag.code === "V6" && flag.severity === "warning") return "flag.V6.overpaid";
  if (flag.code === "V4" && flag.severity === "warning") return "flag.V4.noTotal";
  return `flag.${flag.code}`;
}

/**
 * Numbers inside a message follow the reader's convention, not JavaScript's:
 * "0,78" for someone at the counter in Quito, "0.78" for a reviewer reading in
 * English. Whole numbers stay whole — "98 × 0,78", not "98,00 × 0,78" — because
 * that is how the quantity is written on the paper.
 */
function localizeParams(
  params: Record<string, string | number>,
  locale: string,
): Record<string, string | number> {
  const format = (n: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n);

  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, typeof v === "number" ? format(v) : v]),
  );
}

export function describe(
  flag: Flag,
  t: (key: string, params?: Record<string, string | number>) => string,
  locale = "es-EC",
): { text: string; where: string | null; severity: string } {
  return {
    text: t(messageKey(flag), localizeParams(flag.params, locale)),
    where: flag.line == null ? null : t("flag.line", { line: flag.line }),
    severity: t(flag.severity === "blocking" ? "flag.blocking" : "flag.warning"),
  };
}
