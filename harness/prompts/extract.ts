import type { Config } from "../catalog";

/**
 * The extraction prompt.
 *
 * Three things it is emphatic about, because each is a way the whole system
 * fails quietly rather than loudly:
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
 *   3. Numbers are made of digits. Saying so sounds redundant until a model
 *      reads "14" as "1u" and hands back a quantity of 1 — which is what the
 *      first real run did. Telling it that no letter belongs inside a number,
 *      and which glyph pairs this handwriting confuses, is perception guidance,
 *      not arithmetic authority. The distinction is the whole design: context
 *      may help it see a stroke, never invent a value.
 *
 * The catalog is included so the model knows what words to expect — it measurably
 * helps with abbreviations — but it is told to copy what is written, not to map
 * it. Mapping is the code's job, where a wrong match is visible and reversible.
 */
export function extractionPrompt(config: Config, today = new Date()): string {
  const todayText = today.toISOString().slice(0, 10);
  const catalog = config.materials
    .map((m) => `  - ${m.name}${m.aliases.length ? ` (written as: ${m.aliases.join(", ")})` : ""}`)
    .join("\n");

  return `Today is ${todayText}. You are reading a document from a recycling yard in Quito, Ecuador. Transcribe it. Do not interpret it, and do not calculate anything.

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

1. Transcribe only. Never compute a total, a product or a difference. If a number is not written on the paper, mark the field "absent". Code checks the arithmetic afterwards; a number you supply that the paper does not contain will pass those checks and be wrong.

   The line between reading and calculating matters here, so be precise about it. Using context to see a stroke more clearly is reading, and you should do it. Changing a digit because a total would then work out is fabrication, and you must never do it. If your reading does not match the written total, leave your reading exactly as it is — that mismatch is information, and a person will look at it.

2. Numbers contain digits, a decimal comma, and nothing else. No letters ever appear inside a quantity, a price, an amount or a weight. This handwriting confuses several pairs, and in every case the digit is the right reading:

     4 written open looks like u or y      1 looks like l or a bare stroke
     7 may carry a crossing stroke          0 looks like o
     5 looks like s                         6 looks like b        9 looks like g

   So "1u" is 14, "l0" is 10, "2s" is 25. If you find yourself about to put a letter inside a number, you have misread a digit — look again.

   The decimal comma carries weight: "0,5" is half a unit and "05" is five, a tenfold difference in what gets paid. Never drop a comma, and never drop a leading zero.

   The digits of one number can be written with a gap between them: "2 77,5" is a single quantity, 277,5, not a 2 followed by something else. On a tarjeta line, the quantity is the number at the start of the line, before the material name. The little word that joins them is not part of the material: "98 de Pet" is a quantity of 98 and a material of "Pet", not "de Pet".

   The year deserves particular care. This yard photographs its paperwork within days or weeks, so a date that reads as years old is almost always a misread digit — the first real run returned 2016 and 2024 for documents written in 2026. Look again before you answer. This is not permission to invent a date: if the ink genuinely reads 2016, return 2016 and say so in the notes.

   If two readings of a number are genuinely equally plausible and you cannot decide, mark the field "illegible" instead of picking one. A field a person is told to look at costs them five seconds. A confident wrong digit costs money.

3. Every numeric field declares its state, and the three states are different facts:
   - "read" — you read it. "raw" is exactly the characters written, including the decimal comma ("1.250", "76,40", "0,78"), and "value" is that text as a number (1250, 76.4, 0.78).
   - "absent" — the document has no such value. Leave "raw" empty and "value" 0.
   - "illegible" — the document HAS a value and it cannot be read: smudged, crossed out beyond recovery, cut off. Leave "raw" empty and "value" 0.
   Never use "absent" for something you could not read, and never guess at a smudge. Those two states are how a reviewer knows whether to look for missing paperwork or to squint at the photo.
   "replaces": if the value was crossed out and rewritten, put the crossed-out text here; otherwise leave it empty.

   Every other field is a plain string. When the document does not have it — no plate, no observations — return an empty string.

4. Crossed-out values are normal here. The weigher writes a figure, notices a mistake and writes the correct one above or beside it. Report the CURRENT value in "raw"/"value" and the abandoned one in "replaces". A struck-through figure is never the answer.

5. Materials: copy what is written, exactly — "chat", "grues", "Radiador ALU", "pap.". Do not expand abbreviations and do not correct spelling. For reference, this yard trades in:
${catalog}
   If you see a material that is not on that list, transcribe it anyway. An unknown material is a fact about the document, not an error to fix.

6. Settlement. Note what was paid and how, from the margins:
   - "efect" / cash → kind "efectivo"
   - "Abono" → kind "abono"
   - "Transf." → kind "transferencia"
   - "Debo <amount>" → the balance still owed, in "owed"
   A line like "850,15 − 500 efect = 350" means: the load came to 850,15, 500 was paid in cash, 350 is still owed.

7. Anything you notice about the document itself — a stain, a torn corner, an annotation you cannot interpret — goes in "notes", verbatim where possible. Never put a judgement about whether the numbers are correct in there; that is not your job on this document.

8. Names of people and the yard's logo are deliberately blurred out in these copies. Return an empty "counterparty" when it is unreadable. That is expected, not a failure.

Return the document as the schema requires. If the photo shows something that is neither of the two document types, still answer with your best classification and say so in "notes".`;
}
