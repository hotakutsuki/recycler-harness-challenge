import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./catalog";
import { normalize, resolveMaterial, parseDate } from "./normalize";
import { Sheet } from "./schema";
import { validate, type PriorSheet } from "./validate";

/**
 * The checks are exercised against the same ground truth the evals use.
 *
 * This is the half of the system that owes nothing to the model: given a perfect
 * transcription, the right sheets must come out flagged and — just as important —
 * the clean ones must come out silent. If this test cannot tell them apart, no
 * amount of extraction quality will save the product.
 */

const DATASET = path.join(__dirname, "..", "evals", "dataset");
const TODAY = new Date("2026-09-19T00:00:00Z");

interface Record {
  folio: string;
  scenario: string;
  expected_flags: { code: string; linea?: number }[];
  extraction: unknown;
}

const records: Record[] = fs
  .readdirSync(DATASET)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(DATASET, f), "utf8")) as Record);

describe("the ground truth itself", () => {
  it("has 16 sheets, half of them clean", () => {
    expect(records).toHaveLength(16);
    expect(records.filter((r) => r.expected_flags.length === 0)).toHaveLength(8);
  });

  it("parses against the schema the model is held to", () => {
    for (const r of records) {
      expect(() => Sheet.parse(r.extraction), `hoja ${r.folio}`).not.toThrow();
    }
  });
});

describe("validation over the dataset", () => {
  // Sheets are validated in folio order and fed forward, so the duplicate on 013
  // is detected the way it would be in the app: against what came before it.
  const priors: PriorSheet[] = [];
  const results = records.map((r) => {
    const sheet = normalize(Sheet.parse(r.extraction), DEFAULT_CONFIG, TODAY);
    const flags = validate(sheet, DEFAULT_CONFIG, [...priors], TODAY);
    priors.push({
      dateIso: sheet.dateIso,
      supplier: sheet.supplier,
      plate: sheet.plate,
      linesTotalKg: sheet.linesTotalKg,
      folio: sheet.folio,
    });
    return { record: r, flags };
  });

  for (const { record, flags } of results) {
    it(`hoja ${record.folio}: ${record.scenario}`, () => {
      const got = flags
        .map((f) => `${f.code}${f.line ? `:${f.line}` : ""}`)
        .sort();
      const want = record.expected_flags
        .map((f) => `${f.code}${f.linea ? `:${f.linea}` : ""}`)
        .sort();
      expect(got).toEqual(want);
    });
  }

  it("raises nothing at all on the eight clean sheets", () => {
    const noisy = results
      .filter(({ record, flags }) => record.expected_flags.length === 0 && flags.length > 0)
      .map(({ record, flags }) => `${record.folio}: ${flags.map((f) => f.code).join(", ")}`);
    expect(noisy).toEqual([]);
  });
});

describe("material resolution", () => {
  const { materials } = DEFAULT_CONFIG;

  it("matches the abbreviations the yard actually writes", () => {
    expect(resolveMaterial("chat liv", materials).material?.id).toBe("chatarra_liviana");
    expect(resolveMaterial("fierro", materials).material?.id).toBe("hierro");
    expect(resolveMaterial("cobre 1ra", materials).material?.id).toBe("cobre");
    expect(resolveMaterial("CART.", materials).material?.id).toBe("carton");
    expect(resolveMaterial("plástico", materials).material?.id).toBe("plastico");
  });

  it("refuses to guess at a material it does not know", () => {
    const result = resolveMaterial("bronce", materials);
    expect(result.match).toBe("unknown");
    expect(result.material).toBeNull();
  });

  it("suggests rather than decides on a near miss", () => {
    const result = resolveMaterial("carbon", materials);
    if (result.material) expect(result.match).toBe("fuzzy");
  });
});

describe("dates", () => {
  it("reads the formats that appear on the sheets", () => {
    expect(parseDate("2/03/26", TODAY)).toBe("2026-03-02");
    expect(parseDate("15-03-2026", TODAY)).toBe("2026-03-15");
  });

  it("returns null rather than guessing", () => {
    expect(parseDate("marzo", TODAY)).toBeNull();
    expect(parseDate("32/03/26", TODAY)).toBeNull();
    expect(parseDate("2/13/26", TODAY)).toBeNull();
    expect(parseDate(null, TODAY)).toBeNull();
  });
});
