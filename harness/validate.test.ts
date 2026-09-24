import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, roundCash } from "./catalog";
import { normalize, parseDate, resolveMaterial } from "./normalize";
import { Document, type Comprobante, type Tarjeta } from "./schema";
import { validate } from "./validate";

/**
 * The checks are exercised against real documents from the yard, transcribed by
 * hand. Given a perfect transcription the honest documents must come out silent
 * and the broken ones must come out flagged — a checker that flags everything
 * would score perfectly on detection and be useless at the counter.
 */

const TODAY = new Date("2026-09-21T00:00:00Z");

const n = (raw: string, value: number, replaces: string | null = null) => ({
  raw,
  value,
  legible: true,
  replaces,
});
const illegible = () => ({ raw: "", value: null, legible: false, replaces: null });

const emptySettlement = { total: null, payments: [], owed: null };

function tarjeta(over: Partial<Tarjeta> = {}): Tarjeta {
  return Document.parse({
    kind: "tarjeta",
    card_number: "0000",
    date_raw: "18/09/2026",
    counterparty: null,
    lines: [],
    settlement: emptySettlement,
    notes: [],
    ...over,
  }) as Tarjeta;
}

function comprobante(over: Partial<Comprobante> = {}): Comprobante {
  return Document.parse({
    kind: "comprobante",
    receipt_number: "000000",
    date_raw: "18/09/2026",
    counterparty: null,
    material_raw: "Chatarra",
    plate: null,
    observations: null,
    weighing: { gross: null, tare: null, net: null, unit: null, deductions: [], final_net: null },
    settlement: emptySettlement,
    notes: [],
    ...over,
  }) as Comprobante;
}

const check = (doc: Tarjeta | Comprobante, priors: Parameters<typeof validate>[2] = []) =>
  validate(normalize(doc, DEFAULT_CONFIG, TODAY), DEFAULT_CONFIG, priors, TODAY).map(
    (f) => `${f.code}${f.line ? `:${f.line}` : ""}`,
  );

// Tarjeta 2784, transcribed from the photo. Every line and the total add up.
const TARJETA_2784 = tarjeta({
  card_number: "2784",
  lines: [
    { index: 1, quantity: n("98", 98),       material_raw: "Pet",          unit_price: n("0,78", 0.78), amount: n("76,40", 76.4),  note: null },
    { index: 2, quantity: n("240", 240),     material_raw: "Perfil",       unit_price: n("1,40", 1.4),  amount: n("336,00", 336),  note: null },
    { index: 3, quantity: n("131,5", 131.5), material_raw: "grues",        unit_price: n("1,15", 1.15), amount: n("151,20", 151.2), note: "ALU" },
    { index: 4, quantity: n("80", 80),       material_raw: "cobre",        unit_price: n("6,20", 6.2),  amount: n("496,00", 496),  note: null },
    { index: 5, quantity: n("277,5", 277.5), material_raw: "fundido",      unit_price: n("0,15", 0.15), amount: n("41,60", 41.6),  note: null },
    { index: 6, quantity: n("14", 14),       material_raw: "Radiador ALU", unit_price: n("0,90", 0.9),  amount: n("12,60", 12.6),  note: null },
  ],
  settlement: { total: n("1113,80", 1113.8), payments: [], owed: null },
});

// Comprobante 015641: 5910 − 4030 = 1880, less an 80 deduction, paid 450.
const COMPROBANTE_015641 = comprobante({
  receipt_number: "015641",
  weighing: {
    gross: n("5910", 5910),
    tare: n("4030", 4030),
    net: n("1880", 1880),
    unit: null,
    deductions: [{ amount: n("80", 80), reason: "3 perfil lavadora" }],
    final_net: n("1800", 1800),
  },
  settlement: { total: n("450", 450, "300"), payments: [], owed: null },
});

// Tarjeta 2781: the weigher totalled 830,65, caught it, and wrote 850,15 above.
// Then paid 500 in cash and carried 350 as a debt.
const TARJETA_2781 = tarjeta({
  card_number: "2781",
  lines: [
    { index: 1, quantity: n("93", 93),   material_raw: "Radiador ALU", unit_price: n("0,85", 0.85), amount: n("79,05", 79.05), note: null },
    { index: 2, quantity: n("51", 51),   material_raw: "cobre",        unit_price: n("6,10", 6.1),  amount: n("311,10", 311.1), note: null },
    { index: 3, quantity: n("115", 115), material_raw: "bronce",       unit_price: n("4,00", 4, "3,00"), amount: n("460", 460), note: null },
  ],
  settlement: {
    total: n("850,15", 850.15, "830,65"),
    payments: [{ kind: "efectivo", amount: n("500", 500), raw: "-500 efect" }],
    owed: n("350", 350),
  },
});

describe("documents that are correct must come out silent", () => {
  it("tarjeta 2784 — six lines, all of them rounded down to five cents", () => {
    expect(check(TARJETA_2784)).toEqual([]);
  });

  it("comprobante 015641 — weighing, deduction and an implied price of 0,25", () => {
    expect(check(COMPROBANTE_015641)).toEqual([]);
  });

  it("tarjeta 2781 — reads the corrected total, not the crossed-out one", () => {
    expect(check(TARJETA_2781)).toEqual([]);
  });

  it("would flag 2781 if the model had read the struck-through total instead", () => {
    const misread = tarjeta({
      ...TARJETA_2781,
      settlement: { ...TARJETA_2781.settlement, total: n("830,65", 830.65) },
    });
    expect(check(misread)).toContain("V4");
  });
});

describe("the counter's rounding rule", () => {
  it("truncates down to five cents rather than to the nearest", () => {
    expect(roundCash(76.44, 0.05)).toBeCloseTo(76.4, 2);
    expect(roundCash(151.225, 0.05)).toBeCloseTo(151.2, 2);
    expect(roundCash(41.625, 0.05)).toBeCloseTo(41.6, 2);
    expect(roundCash(0.825, 0.05)).toBeCloseTo(0.8, 2);
    expect(roundCash(336, 0.05)).toBeCloseTo(336, 2);
  });

  it("without it, honest lines would be flagged — which is the real risk", () => {
    const line = TARJETA_2784.lines[0]!; // 98 × 0,78 = 76,44 written as 76,40
    expect(Math.abs(98 * 0.78 - line.amount!.value!)).toBeGreaterThan(0.03);
    expect(check(TARJETA_2784)).toEqual([]);
  });
});

describe("documents that are wrong must be caught", () => {
  it("a miscalculated line", () => {
    const doc = tarjeta({
      lines: [
        { index: 1, quantity: n("400", 400), material_raw: "carton", unit_price: n("0,04", 0.04), amount: n("18,00", 18), note: null },
      ],
      settlement: { total: n("18,00", 18), payments: [], owed: null },
    });
    expect(check(doc)).toContain("V1:1");
  });

  it("a total that does not match the lines", () => {
    const doc = tarjeta({
      lines: [
        { index: 1, quantity: n("10", 10), material_raw: "pet", unit_price: n("0,78", 0.78), amount: n("7,80", 7.8), note: null },
      ],
      settlement: { total: n("9,00", 9), payments: [], owed: null },
    });
    expect(check(doc)).toContain("V4");
  });

  it("a truck subtraction that does not hold", () => {
    const doc = comprobante({
      weighing: { gross: n("5000", 5000), tare: n("3900", 3900), net: n("1200", 1200), unit: null, deductions: [], final_net: null },
      settlement: { total: n("300", 300), payments: [], owed: null },
    });
    expect(check(doc)).toContain("V2");
  });

  it("a deduction that does not come off the net properly", () => {
    const doc = comprobante({
      weighing: {
        gross: n("3000", 3000), tare: n("1000", 1000), net: n("2000", 2000), unit: null,
        deductions: [{ amount: n("80", 80), reason: "tanque" }],
        final_net: n("1950", 1950),
      },
      settlement: { total: n("487,50", 487.5), payments: [], owed: null },
    });
    expect(check(doc)).toContain("V3");
  });

  it("tolerates the cents dropped when cash changes hands", () => {
    // Card 2781: 850,15 − 500 in cash was settled as a round 350.
    expect(check(TARJETA_2781)).toEqual([]);
  });

  it("a settlement that does not balance", () => {
    const doc = tarjeta({
      lines: [
        { index: 1, quantity: n("100", 100), material_raw: "pet", unit_price: n("0,78", 0.78), amount: n("78,00", 78), note: null },
      ],
      settlement: {
        total: n("78,00", 78),
        payments: [{ kind: "efectivo", amount: n("50", 50), raw: "50 efect" }],
        owed: n("8", 8), // should be 28: a dollar of rounding cannot explain this
      },
    });
    expect(check(doc)).toContain("V6");
  });

  it("a material nobody in the catalog knows", () => {
    const doc = tarjeta({
      lines: [
        { index: 1, quantity: n("25", 25), material_raw: "zamak", unit_price: n("2,00", 2), amount: n("50,00", 50), note: null },
      ],
      settlement: { total: n("50,00", 50), payments: [], owed: null },
    });
    expect(check(doc)).toContain("V5:1");
  });

  it("a scribbled-out weight, with no value invented to replace it", () => {
    const doc = tarjeta({
      lines: [
        { index: 1, quantity: illegible(), material_raw: "pet", unit_price: n("0,78", 0.78), amount: illegible(), note: null },
      ],
      settlement: { total: n("10,00", 10), payments: [], owed: null },
    });
    expect(check(doc)).toEqual(["V9:1"]);
  });

  it("a total with nothing weighed behind it", () => {
    // Receipt 015635 read this way: the model returned the total and left the
    // "160 kg" on the paper out entirely. Every arithmetic check passed.
    const doc = comprobante({ settlement: { total: n("40,00", 40), payments: [], owed: null } });
    expect(check(doc)).toContain("V10");
  });

  it("a year that reads a decade off", () => {
    // 18/09/2016 for 18/09/2026: every sum still adds up, and the purchase
    // lands in a year nobody will ever look at.
    const doc = comprobante({
      date_raw: "18/09/2016",
      weighing: { gross: n("1000", 1000), tare: n("800", 800), net: n("200", 200), unit: null, deductions: [], final_net: null },
      settlement: { total: n("50", 50), payments: [], owed: null },
    });
    expect(check(doc)).toContain("V7");
  });

  it("a price outside the band the material trades in", () => {
    const doc = tarjeta({
      lines: [
        { index: 1, quantity: n("10", 10), material_raw: "cobre", unit_price: n("0,61", 0.61), amount: n("6,10", 6.1), note: null },
      ],
      settlement: { total: n("6,10", 6.1), payments: [], owed: null },
    });
    expect(check(doc)).toContain("PRECIO:1");
  });

  it("a quantity misread by a factor of ten, on a line with no unit price", () => {
    // Card 2783: "0,5 cobre — 2,50", read as a quantity of 5. Nothing to
    // multiply, so no arithmetic check applies; the price it implies does the
    // work — 0,50 a kilo for copper is nowhere near the band.
    const doc = tarjeta({
      lines: [
        { index: 1, quantity: n("05", 5), material_raw: "cobre", unit_price: null, amount: n("2,50", 2.5), note: null },
      ],
      settlement: { total: n("2,50", 2.5), payments: [], owed: null },
    });
    expect(check(doc)).toContain("PRECIO:1");
  });

  it("stays quiet when that same line is read correctly", () => {
    const doc = tarjeta({
      lines: [
        { index: 1, quantity: n("0,5", 0.5), material_raw: "cobre", unit_price: null, amount: n("2,50", 2.5), note: null },
      ],
      settlement: { total: n("2,50", 2.5), payments: [], owed: null },
    });
    expect(check(doc)).toEqual([]);
  });

  it("a truck load settled at an implausible price per unit", () => {
    const doc = comprobante({
      weighing: { gross: n("5000", 5000), tare: n("4000", 4000), net: n("1000", 1000), unit: null, deductions: [], final_net: null },
      settlement: { total: n("2500", 2500), payments: [], owed: null }, // 2,50 per unit
    });
    expect(check(doc)).toContain("PRECIO");
  });

  it("a day that disagrees with the receipts either side of it", () => {
    // 015646 read as the 10th when 015644 and 015645 are both the 18th. Every
    // sum still adds up; only the neighbours give it away.
    const priors = [
      { kind: "comprobante", folio: "015644", dateIso: "2026-09-18", total: 100 },
      { kind: "comprobante", folio: "015645", dateIso: "2026-09-18", total: 100 },
    ];
    const doc = comprobante({
      receipt_number: "015646",
      date_raw: "10/09/2026",
      weighing: { gross: n("2770", 2770), tare: n("1990", 1990), net: n("780", 780), unit: null, deductions: [], final_net: null },
      settlement: { total: n("202,80", 202.8), payments: [], owed: null },
    });
    expect(check(doc, priors)).toContain("V11");
  });

  it("stays quiet when the neighbours do not agree among themselves", () => {
    // Receipt 015642 really is dated a month before its neighbours. A check
    // that cannot accept an outlier is one people learn to click through.
    const priors = [
      { kind: "comprobante", folio: "015641", dateIso: "2026-09-18", total: 100 },
      { kind: "comprobante", folio: "015643", dateIso: "2026-08-19", total: 100 },
    ];
    const doc = comprobante({
      receipt_number: "015642",
      date_raw: "19/08/2026",
      weighing: { gross: n("2100", 2100), tare: n("1660", 1660), net: n("440", 440), unit: null, deductions: [], final_net: null },
      settlement: { total: n("88", 88), payments: [], owed: null },
    });
    expect(check(doc, priors)).not.toContain("V11");
  });

  it("the same folio photographed twice", () => {
    const priors = [{ kind: "comprobante", folio: "015641", dateIso: "2026-09-18", total: 450 }];
    expect(check(COMPROBANTE_015641, priors)).toContain("V8");
  });
});

describe("material resolution", () => {
  const { materials } = DEFAULT_CONFIG;

  it("ignores the word that joins a quantity to its material", () => {
    // The card says "98 de Pet". The "de" belongs to the sentence, not the
    // material, and the catalog should not need an alias for every phrasing.
    expect(resolveMaterial("de Pet", materials).material?.id).toBe("pet");
    expect(resolveMaterial("de fundido", materials).material?.id).toBe("fundido");
  });

  it("matches what the weigher actually writes", () => {
    expect(resolveMaterial("Pet", materials).material?.id).toBe("pet");
    expect(resolveMaterial("grues", materials).material?.id).toBe("gruesa");
    expect(resolveMaterial("chat", materials).material?.id).toBe("chatarra");
    expect(resolveMaterial("Radiador ALU", materials).material?.id).toBe("radiador");
  });

  it("suggests rather than decides when the match is not exact", () => {
    expect(resolveMaterial("chatara", materials).match).toBe("fuzzy");
    expect(resolveMaterial("Pet", materials).match).toBe("alias");
  });

  it("gives up rather than guess when the writing is too mangled", () => {
    // "cahtrr" for chatarra: the letters are all there and in the wrong order.
    // The system does not decide; it asks, and once told it remembers — which
    // is what the alias list in the settings screen is for.
    const result = resolveMaterial("cahtrr", materials);
    expect(result.match).not.toBe("alias");

    const taught = [...materials];
    const chatarra = taught.find((m) => m.id === "chatarra")!;
    taught[taught.indexOf(chatarra)] = { ...chatarra, aliases: [...chatarra.aliases, "cahtrr"] };
    expect(resolveMaterial("cahtrr", taught).match).toBe("alias");
  });

  it("refuses to guess at something it does not know", () => {
    const result = resolveMaterial("zamak", materials);
    expect(result.match).toBe("unknown");
    expect(result.material).toBeNull();
  });
});

describe("dates", () => {
  it("reads the formats on these documents", () => {
    expect(parseDate("18/09/2026", TODAY)).toBe("2026-09-18");
    expect(parseDate("18/9/2026", TODAY)).toBe("2026-09-18");
    expect(parseDate("14/09/2026", TODAY)).toBe("2026-09-14");
  });

  it("returns null rather than guessing", () => {
    expect(parseDate("18/09", TODAY)).toBeNull();
    expect(parseDate("32/09/2026", TODAY)).toBeNull();
    expect(parseDate(null, TODAY)).toBeNull();
  });
});
