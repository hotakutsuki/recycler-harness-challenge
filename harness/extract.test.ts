import { describe, expect, it } from "vitest";
import { toDocument, type WireDocument } from "./extract";
import { compareReadings, focusFor } from "./reread";
import { Document } from "./schema";
import type { Flag } from "./validate";

/**
 * The wire format and the domain model are two different shapes on purpose, and
 * `toDocument` is the only place they meet. If that conversion drifts — a field
 * renamed on one side, a nesting changed — nothing fails loudly: documents come
 * back missing a value, which reads as a model that got worse. These tests are
 * the alarm for that.
 */

const n = (raw: string, value: number, replaces: string | null = null) => ({
  raw,
  value,
  legible: true,
  replaces,
});

const wire = (over: Partial<WireDocument> = {}): WireDocument => ({
  kind: "tarjeta",
  folio: "2784",
  date_raw: "18/09/2026",
  counterparty: null,
  material_raw: null,
  plate: null,
  observations: null,
  lines: [],
  weighing: { gross: null, tare: null, net: null, unit: null, deductions: [], final_net: null },
  settlement: { total: null, payments: [], owed: null },
  notes: [],
  ...over,
});

describe("the wire format to the domain model", () => {
  it("puts the folio where each document type keeps it", () => {
    const card = toDocument(wire({ kind: "tarjeta", folio: "2784" }));
    const receipt = toDocument(wire({ kind: "comprobante", folio: "015641" }));

    expect(card.kind === "tarjeta" && card.card_number).toBe("2784");
    expect(receipt.kind === "comprobante" && receipt.receipt_number).toBe("015641");
  });

  it("carries lines, prices and the settlement across", () => {
    const doc = toDocument(
      wire({
        lines: [
          {
            index: 1,
            quantity: n("98", 98),
            material_raw: "Pet",
            unit_price: n("0,78", 0.78),
            amount: n("76,40", 76.4),
            note: null,
          },
        ],
        settlement: {
          total: n("76,40", 76.4),
          payments: [{ kind: "efectivo", amount: n("50", 50), raw: "-50 efect" }],
          owed: n("26,40", 26.4),
        },
      }),
    );

    expect(doc.kind).toBe("tarjeta");
    if (doc.kind !== "tarjeta") return;
    expect(doc.lines[0]?.material_raw).toBe("Pet");
    expect(doc.lines[0]?.amount?.value).toBe(76.4);
    expect(doc.settlement.payments[0]?.kind).toBe("efectivo");
    expect(doc.settlement.owed?.value).toBe(26.4);
  });

  it("carries the whole weighing block, deductions included", () => {
    const doc = toDocument(
      wire({
        kind: "comprobante",
        folio: "015641",
        material_raw: "Chatarra",
        weighing: {
          gross: n("5910", 5910),
          tare: n("4030", 4030),
          net: n("1880", 1880),
          unit: null,
          deductions: [{ amount: n("80", 80), reason: "3 perfil lavadora" }],
          final_net: n("1800", 1800),
        },
        settlement: { total: n("450", 450, "300"), payments: [], owed: null },
      }),
    );

    expect(doc.kind).toBe("comprobante");
    if (doc.kind !== "comprobante") return;
    expect(doc.weighing.gross?.value).toBe(5910);
    expect(doc.weighing.deductions[0]?.reason).toBe("3 perfil lavadora");
    expect(doc.weighing.final_net?.value).toBe(1800);
    // The struck-out figure survives the conversion: it is evidence.
    expect(doc.settlement.total?.replaces).toBe("300");
  });

  it("numbers the lines when the model does not", () => {
    const doc = toDocument(
      wire({
        lines: [
          { index: 0, quantity: null, material_raw: "Pet", unit_price: null, amount: null, note: null },
          { index: 0, quantity: null, material_raw: "cobre", unit_price: null, amount: null, note: null },
        ],
      }),
    );
    expect(doc.kind === "tarjeta" && doc.lines.map((l) => l.index)).toEqual([1, 2]);
  });

  it("produces something the domain schema accepts", () => {
    expect(() => Document.parse(toDocument(wire({ kind: "comprobante" })))).not.toThrow();
  });
});

describe("what the second reading is asked to look at", () => {
  const flag = (code: Flag["code"], line?: number): Flag => ({
    code,
    severity: "blocking",
    params: {},
    ...(line ? { line } : {}),
  });

  it("names the fields behind each failed check", () => {
    expect(focusFor([flag("V1", 3)])).toContain("line 3");
    expect(focusFor([flag("V2")])).toContain("truck weights");
    expect(focusFor([flag("V6")])).toContain("owed");
  });

  it("never hints at what the answer should be", () => {
    const focus = focusFor([flag("V1", 1), flag("V4")]) ?? "";
    // The failure this guards against is a second pass that knows the target:
    // told the sums must match, a model will happily produce a number that
    // makes them match, and it will pass every check afterwards.
    for (const giveaway of ["should", "expected", "correct", "must be", "76", "instead"]) {
      expect(focus.toLowerCase()).not.toContain(giveaway);
    }
  });

  it("asks for nothing when only warnings are open", () => {
    expect(focusFor([{ code: "PRECIO", severity: "warning", params: {} }])).toBeNull();
    expect(focusFor([])).toBeNull();
  });
});

describe("comparing the two readings", () => {
  const card = (amount: string, value: number) =>
    toDocument(
      wire({
        lines: [
          {
            index: 1,
            quantity: n("98", 98),
            material_raw: "Pet",
            unit_price: n("0,78", 0.78),
            amount: n(amount, value),
            note: null,
          },
        ],
        settlement: { total: n(amount, value), payments: [], owed: null },
      }),
    );

  it("agrees when both passes read the same digits", () => {
    expect(compareReadings(card("76,40", 76.4), card("76,40", 76.4))).toEqual([]);
  });

  it("ignores a difference that is only a separator convention", () => {
    const a = card("1.250", 1250);
    const b = card("1250", 1250);
    expect(compareReadings(a, b)).toEqual([]);
  });

  it("reports where they actually differ, with both values", () => {
    const diffs = compareReadings(card("76,40", 76.4), card("70,40", 70.4));
    expect(diffs.map((d) => d.path)).toContain("line 1 amount");
    expect(diffs.some((d) => d.first === "76,40" && d.second === "70,40")).toBe(true);
  });

  it("treats a different document type as the only thing worth saying", () => {
    const diffs = compareReadings(card("10", 10), toDocument(wire({ kind: "comprobante" })));
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.path).toBe("document type");
  });
});
