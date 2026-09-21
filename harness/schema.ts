import { z } from "zod";

/**
 * The shape of what the model reads off a document.
 *
 * Used three ways, which is why it lives here alone: converted to JSON Schema it
 * is the model's output contract, `Document.parse()` validates the response at
 * runtime, and `z.infer` gives the UI its types.
 *
 * The yard keeps two kinds of paper, and they are genuinely different documents:
 *
 *   tarjeta      A numbered green card the weigher fills in for walk-in suppliers
 *                — handcart and small loads, weighed on the small scale. One line
 *                per material: quantity, unit price, amount. Free-form, no grid.
 *
 *   comprobante  A pre-printed receipt for truck loads. The truck is weighed full
 *                (E, entero), then empty (S, solo camión); the difference is the
 *                net (N). Deductions come off that, and a single total is paid for
 *                the whole load — the unit price is never written down.
 *
 * Both end the same way for the business: material came in, money went out, and
 * sometimes part of the money is still owed.
 */

export const Unit = z.enum(["kg", "lb", "qq", "t"]);
export type Unit = z.infer<typeof Unit>;

/**
 * Every number the model reads is reported twice: `raw` is the ink exactly as
 * written ("1.250", "76,40"), `value` is that text parsed.
 *
 * `legible: false` means it could not be read, and then `value` must be null —
 * guessing is a failure, not a fallback.
 *
 * `replaces` carries a crossed-out value when one is visible. On these documents
 * a struck-through total is normal, not exceptional: the weigher writes a figure,
 * spots the mistake and writes the right one above it. The reading that counts is
 * the current one; the struck one is kept because it is evidence of a correction,
 * and because a model that silently reads the wrong one of the two is a bug we
 * want the evals to catch.
 */
export const NumberField = z.object({
  raw: z.string(),
  value: z.number().nullable(),
  legible: z.boolean(),
  replaces: z.string().nullable(),
});
export type NumberField = z.infer<typeof NumberField>;

/** How the payment was settled. Written in the margin: "efect", "Abono", "Transf.", "Debo". */
export const PaymentKind = z.enum(["efectivo", "abono", "transferencia", "debe", "otro"]);

export const Payment = z.object({
  kind: PaymentKind,
  amount: NumberField.nullable(),
  /** The words as written, so a reviewer can see what the classification came from. */
  raw: z.string(),
});

/**
 * What was settled at the counter. The yard rarely pays the whole amount in cash
 * on the spot: part is paid, the rest is carried as a debt to the supplier, and a
 * later visit clears it. Recording only the purchase total would leave the cash
 * report wrong on both days.
 */
export const Settlement = z.object({
  /** The amount the load came to, before anything was paid. */
  total: NumberField.nullable(),
  payments: z.array(Payment),
  /** The balance still owed, when the document states one ("Debo 596,25"). */
  owed: NumberField.nullable(),
});

const CommonHeader = {
  /** The date as written: "18/09/2026", "18/9/2026". */
  date_raw: z.string().nullable(),
  /**
   * The person the money went to. Blurred out in the published dataset, so the
   * model is expected to return null for these documents — the field stays in the
   * schema because a yard running this on its own paper needs it.
   */
  counterparty: z.string().nullable(),
};

/** One material line on a tarjeta: "98 de Pet  0,78  76,40". */
export const TarjetaLine = z.object({
  index: z.number().int().positive(),
  /** How much of it, in whatever unit that material is traded in at this yard. */
  quantity: NumberField.nullable(),
  /** Exactly as written — "Pet", "grues", "chat", "Radiador ALU". */
  material_raw: z.string(),
  unit_price: NumberField.nullable(),
  amount: NumberField.nullable(),
  /** Anything else on the line: a tag like "ALU", a scribble, a note. */
  note: z.string().nullable(),
});

export const Tarjeta = z.object({
  kind: z.literal("tarjeta"),
  /** The pre-printed card number, top right: 2776, 2784. */
  card_number: z.string().nullable(),
  ...CommonHeader,
  lines: z.array(TarjetaLine),
  settlement: Settlement,
  notes: z.array(z.string()),
});

/** The weighing block of a comprobante: E − S = N, then deductions. */
export const TruckWeighing = z.object({
  /** "entero": the truck with the load. */
  gross: NumberField.nullable(),
  /** "solo camión": the truck empty. */
  tare: NumberField.nullable(),
  /** "neto": what the yard is buying. */
  net: NumberField.nullable(),
  unit: Unit.nullable(),
  /** Written as "− 80   2 tanques filtros": weight discounted, and why. */
  deductions: z.array(
    z.object({ amount: NumberField.nullable(), reason: z.string().nullable() }),
  ),
  /** The weight left after the deductions, when the sheet states it. */
  final_net: NumberField.nullable(),
});

export const Comprobante = z.object({
  kind: z.literal("comprobante"),
  /** Pre-printed in red, top right: 015641. */
  receipt_number: z.string().nullable(),
  ...CommonHeader,
  /** The material box at the top: "Chatarra". A whole load, one material. */
  material_raw: z.string().nullable(),
  plate: z.string().nullable(),
  observations: z.string().nullable(),
  weighing: TruckWeighing,
  settlement: Settlement,
  notes: z.array(z.string()),
});

/**
 * One document, either kind. The model decides which it is looking at — that is
 * the first thing the harness asks of it, and getting it wrong is its own failure
 * mode in the evals, separate from misreading a number.
 */
export const Document = z.discriminatedUnion("kind", [Tarjeta, Comprobante]);

export type Document = z.infer<typeof Document>;
export type Tarjeta = z.infer<typeof Tarjeta>;
export type Comprobante = z.infer<typeof Comprobante>;
export type TarjetaLine = z.infer<typeof TarjetaLine>;
export type Settlement = z.infer<typeof Settlement>;
export type Payment = z.infer<typeof Payment>;
