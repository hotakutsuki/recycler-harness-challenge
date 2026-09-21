import { DEFAULT_CONFIG, type Config, type Material } from "@/harness/catalog";
import { normalize, type NormalizedDocument } from "@/harness/normalize";
import type { Document } from "@/harness/schema";
import { validate, type Flag, type PriorDocument } from "@/harness/validate";
import { db } from "./db";

/**
 * The harness, wired to the database: config in, document through the checks,
 * results out. Everything it calls is pure; this file only moves data.
 */

/** The yard's configuration as the pure functions want it. */
export async function loadConfig(): Promise<Config> {
  const [config, materials] = await Promise.all([
    db.config.findUnique({ where: { id: 1 } }),
    db.material.findMany({ where: { active: true }, include: { aliases: true }, orderBy: { position: "asc" } }),
  ]);

  const catalog: Material[] = materials.map((m) => ({
    id: m.id,
    name: m.name,
    aliases: m.aliases.map((a) => a.text),
    price: m.price,
    unit: m.unit as Material["unit"],
    priceRange: { min: m.priceMin, max: m.priceMax },
  }));

  return {
    ...DEFAULT_CONFIG,
    materials: catalog.length ? catalog : DEFAULT_CONFIG.materials,
    cashRounding: config?.cashRounding ?? DEFAULT_CONFIG.cashRounding,
    bulkPriceRange: {
      min: config?.bulkPriceMin ?? DEFAULT_CONFIG.bulkPriceRange.min,
      max: config?.bulkPriceMax ?? DEFAULT_CONFIG.bulkPriceRange.max,
    },
    currency: config?.currency ?? DEFAULT_CONFIG.currency,
    photoRetentionDays: config?.photoRetentionDays ?? DEFAULT_CONFIG.photoRetentionDays,
  };
}

/** Documents already in the ledger, so a re-photographed folio is caught. */
async function priorDocuments(exceptSheetId: string): Promise<PriorDocument[]> {
  const events = await db.weighingEvent.findMany({
    where: { sheetId: { not: exceptSheetId }, sheet: { status: { in: ["ready", "committed"] } } },
    select: { kind: true, folio: true, date: true, total: true },
  });
  return events.map((e) => ({ kind: e.kind, folio: e.folio, dateIso: e.date, total: e.total }));
}

export interface CheckResult {
  normalized: NormalizedDocument;
  flags: Flag[];
}

export async function check(
  document: Document,
  sheetId: string,
  config?: Config,
): Promise<CheckResult> {
  const cfg = config ?? (await loadConfig());
  const normalized = normalize(document, cfg);
  const flags = validate(normalized, cfg, await priorDocuments(sheetId));
  return { normalized, flags };
}

/**
 * Writes the document to the ledger.
 *
 * Replaces the event wholesale rather than diffing: a sheet is re-saved only
 * when a person corrected it, and at that point the previous reading has no
 * standing. What the model originally read is not lost — it stays on the sheet
 * in `rawExtraction`, untouched.
 */
export async function persist(sheetId: string, normalized: NormalizedDocument): Promise<void> {
  await db.weighingEvent.deleteMany({ where: { sheetId } });

  await db.weighingEvent.create({
    data: {
      sheetId,
      kind: normalized.kind,
      folio: normalized.folio,
      date: normalized.dateIso,
      counterparty: normalized.counterparty,
      truckGross: normalized.truck?.gross ?? null,
      truckTare: normalized.truck?.tare ?? null,
      truckNet: normalized.truck?.net ?? null,
      truckUnit: normalized.truck?.unit ?? null,
      deductions: normalized.truck?.deductions ?? null,
      finalNet: normalized.truck?.finalNet ?? null,
      bulkMaterialId: normalized.bulkMaterialId,
      total: normalized.settlement.total,
      paid: normalized.settlement.paid,
      owed: normalized.settlement.owed,
      lines: {
        create: normalized.lines.map((line) => ({
          position: line.index,
          materialRaw: line.materialRaw,
          materialId: line.materialId,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
          amount: line.amount,
          note: line.note,
        })),
      },
    },
  });
}
