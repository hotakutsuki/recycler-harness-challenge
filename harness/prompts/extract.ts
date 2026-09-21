import type { Config } from "../catalog";

/**
 * The extraction prompt.
 *
 * Two things it is emphatic about, because both are ways the whole system fails
 * quietly rather than loudly:
 *
 *   1. Transcribe, do not calculate. Every total on these documents is checked
 *      in code afterwards. A model that "helpfully" fixes a sum produces a
 *      number that passes every check and is wrong, which is the most expensive
 *      failure this system can have.
 *
 *   2. When a value is crossed out and rewritten, the current one is the answer
 *      and the struck one goes in `replaces`. This is routine on this paper, not
 *      exceptional.
 *
 * The catalog is included so the model knows what words to expect — it measurably
 * helps with abbreviations — but it is told to copy what is written, not to map
 * it. Mapping is the code's job, where a wrong match is visible and reversible.
 */
export function extractionPrompt(config: Config): string {
  const catalog = config.materials
    .map((m) => `  - ${m.name}${m.aliases.length ? ` (written as: ${m.aliases.join(", ")})` : ""}`)
    .join("\n");

  return `You are reading a document from a recycling yard in Quito, Ecuador. Transcribe it. Do not interpret it, and do not calculate anything.

There are exactly two kinds of document:

TARJETA — a small numbered card (the number is pre-printed, four digits, e.g. 2784), handwritten free-form with no grid. Below the date there is one line per material, typically:
    <quantity>  <material>  <unit price>  <amount>
The quantity and material are usually in one colour and the price and amount in another, often written above or between the words. Some lines have no unit price, only an amount. At the foot there is usually a total, sometimes with what was paid and what is still owed.

COMPROBANTE DE INGRESO — a pre-printed form with a red serial number (six digits, e.g. 015641) and a ruled table. A truck is weighed full and empty:
    <weight> E    entero: the truck with the load
    <weight> S    solo camión: the truck empty
    <weight> N    neto: the difference, what is being bought
Below that there may be deductions written as "− 80  2 tanques filtros" and a final weight. The total paid is in the TOTAL $ box. A comprobante never states a unit price.

RULES

1. Transcribe only. Never compute a total, a product or a difference. If a number is not written on the paper, leave it null. Code checks the arithmetic afterwards; a number you supply that the paper does not contain will pass those checks and be wrong.

2. Every numeric field has four parts:
   - "raw": exactly the characters written, including the decimal comma: "1.250", "76,40", "0,78"
   - "value": that text as a number: 1250, 76.4, 0.78
   - "legible": false if you cannot read it. Then "value" must be null. Never guess at a smudge.
   - "replaces": if the value was crossed out and rewritten, the crossed-out text goes here; otherwise null.

3. Crossed-out values are normal here. The weigher writes a figure, notices a mistake and writes the correct one above or beside it. Report the CURRENT value in "raw"/"value" and the abandoned one in "replaces". A struck-through figure is never the answer.

4. Materials: copy what is written, exactly — "chat", "grues", "Radiador ALU", "pap.". Do not expand abbreviations and do not correct spelling. For reference, this yard trades in:
${catalog}
   If you see a material that is not on that list, transcribe it anyway. An unknown material is a fact about the document, not an error to fix.

5. Settlement. Note what was paid and how, from the margins:
   - "efect" / cash → kind "efectivo"
   - "Abono" → kind "abono"
   - "Transf." → kind "transferencia"
   - "Debo <amount>" → the balance still owed, in "owed"
   A line like "850,15 − 500 efect = 350" means: the load came to 850,15, 500 was paid in cash, 350 is still owed.

6. Anything you notice about the document itself — a stain, a torn corner, an annotation you cannot interpret — goes in "notes", verbatim where possible. Never put a judgement about whether the numbers are correct in there; that is not your job on this document.

7. Names of people and the yard's logo are deliberately blurred out in these copies. Leave "counterparty" null when it is unreadable. That is expected, not a failure.

Return the document as the schema requires. If the photo shows something that is neither of the two document types, still answer with your best classification and say so in "notes".`;
}
