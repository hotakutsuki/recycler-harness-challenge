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
  return `flag.${flag.code}`;
}

export function describe(
  flag: Flag,
  t: (key: string, params?: Record<string, string | number>) => string,
): { text: string; where: string | null; severity: string } {
  return {
    text: t(messageKey(flag), flag.params),
    where: flag.line == null ? null : t("flag.line", { line: flag.line }),
    severity: t(flag.severity === "blocking" ? "flag.blocking" : "flag.warning"),
  };
}
