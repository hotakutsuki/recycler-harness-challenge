import { z } from "zod";

/**
 * The single source of truth for the shape of an extracted weighing sheet.
 *
 * This schema is used three ways, and that is the point of keeping it here:
 *   - converted to JSON Schema, it is the output contract sent to the model
 *   - `Sheet.parse(json)` validates what comes back at runtime
 *   - `z.infer` gives the UI its types
 *
 * Nothing in this file imports Next.js, the database, or the Anthropic SDK.
 */

/** Units that appear on the sheets. 1 qq = 100 lb; conversion lives in normalize.ts. */
export const Unit = z.enum(["kg", "lb", "qq", "t"]);
export type Unit = z.infer<typeof Unit>;

/**
 * Every number the model reads is reported twice.
 *
 * `raw` is the ink: "1.250", "1250", "1,250" — whatever is physically on the paper.
 * `value` is that text parsed into a number.
 *
 * Keeping both lets the review screen show the clerk what was written next to the
 * photo, and lets the evals tell a misread digit apart from a misparsed thousands
 * separator. `legible: false` means the model could not read it — `value` must then
 * be null. Guessing is a failure, not a fallback.
 */
export const NumberField = z.object({
  raw: z.string(),
  value: z.number().nullable(),
  legible: z.boolean(),
});
export type NumberField = z.infer<typeof NumberField>;

/** The truck scale: gross − tare = net. Absent on sheets for walk-in deliveries. */
export const TruckWeights = z.object({
  gross: NumberField.nullable(),
  tare: NumberField.nullable(),
  net: NumberField.nullable(),
  unit: Unit.nullable(),
});

export const SheetHeader = z.object({
  /** The weighing date, as written: "02/03/2026", "15-03-2026", "2 mar 26". */
  date_raw: z.string().nullable(),
  /** ISO date, only when the written date is unambiguous; otherwise null and flagged. */
  date_iso: z.string().nullable(),
  supplier: z.string().nullable(),
  plate: z.string().nullable(),
  weigher: z.string().nullable(),
  /** The pre-printed folio number, which links a sheet to its ground truth. */
  folio: z.string().nullable(),
  truck: TruckWeights.nullable(),
});

export const SheetLine = z.object({
  /** Row number as printed on the form, 1-based. */
  index: z.number().int().positive(),
  /** The material exactly as written — "chat. liv.", not "chatarra liviana". */
  material_raw: z.string(),
  gross: NumberField.nullable(),
  unit: Unit.nullable(),
  /** Weight discounted for material that is not what is being bought. */
  deduction: NumberField.nullable(),
  /** Why the deduction was taken: "agarraderas plást.", "radiador c/ plástico". */
  deduction_reason: z.string().nullable(),
  net: NumberField.nullable(),
  /** Unit price written on the sheet, when the sheet has price columns. */
  price: NumberField.nullable(),
  amount: NumberField.nullable(),
});

export const Sheet = z.object({
  header: SheetHeader,
  lines: z.array(SheetLine),
  /** Totals written at the foot of the sheet. Often left blank — that is not an error. */
  total_net: NumberField.nullable(),
  total_amount: NumberField.nullable(),
  /**
   * Anything the model wants to say about the photo itself: glare, a torn corner,
   * a crossed-out value. Never a judgement about whether the numbers are right —
   * that is validate.ts's job, and asking the model for it invites invented fixes.
   */
  notes: z.array(z.string()),
});

export type Sheet = z.infer<typeof Sheet>;
export type SheetHeader = z.infer<typeof SheetHeader>;
export type SheetLine = z.infer<typeof SheetLine>;
