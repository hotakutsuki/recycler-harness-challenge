import type { Unit } from "./schema";

/**
 * The yard's catalog and the settings that govern validation.
 *
 * Plain data, passed into the pure functions as an argument. In the running app
 * it comes from the configuration screen; here it is the starting point a yard
 * edits on day one, because every yard names and prices things its own way.
 *
 * The prices below are what a real yard in Quito was paying in September 2026,
 * read off its own paperwork. They are a demo default, not a market reference.
 */

export interface Material {
  id: string;
  name: string;
  /** How it is written on the paper. Matched case- and accent-insensitively. */
  aliases: string[];
  /** What the yard pays per unit of this material, in USD. */
  price: number;
  /**
   * The unit this material is bought in. The paper almost never says — everyone
   * at the counter knows that PET is weighed one way and aluminium another — so
   * the catalog is where that knowledge lives. A weight written *with* a unit on
   * the document always wins over this.
   */
  unit: Unit;
  /**
   * The band a written price may fall in before the line is flagged. Prices here
   * are negotiated per load, so a fixed price would flag half the honest lines;
   * what is worth a human's attention is a price outside the band the yard
   * actually trades in.
   */
  priceRange: { min: number; max: number };
}

export interface Config {
  materials: Material[];
  /**
   * Amounts are truncated down to a multiple of this. Discovered from the paper,
   * not assumed: 98 × 0,78 = 76,44 is written 76,40; 131,5 × 1,15 = 151,225 is
   * written 151,20; 16,5 × 0,05 = 0,825 is written 0,80. Five cases out of five
   * round *down* to five cents, never to the nearest. Without this rule the
   * checks would flag most correct lines, which is the fastest way to make a
   * reviewer stop trusting the system.
   */
  cashRounding: number;
  /** Slack on money comparisons, in USD. */
  amountEpsilon: number;
  /**
   * Slack when checking that total − paid = owed.
   *
   * Wider than `amountEpsilon` because cash at the counter moves in whole
   * dollars: on card 2781 the balance of 350,15 was written, and settled, as
   * 350. Provisional — it comes from one observation and is worth confirming
   * with the yard before it hardens into a rule.
   */
  settlementEpsilon: number;
  /** Slack on weight comparisons, in the document's own unit. */
  weightEpsilon: number;
  /** Band for the implied price on a comprobante, where no unit price is written. */
  bulkPriceRange: { min: number; max: number };
  currency: string;
  photoRetentionDays: number;
}

export const DEFAULT_CATALOG: Material[] = [
  { id: "pet",         name: "PET",              aliases: ["pet"],                                   price: 0.78, unit: "kg", priceRange: { min: 0.40, max: 0.95 } },
  { id: "perfil",      name: "Perfil",           aliases: ["perfil"],                                price: 1.40, unit: "kg", priceRange: { min: 1.00, max: 1.80 } },
  { id: "gruesa",      name: "Chatarra gruesa",  aliases: ["grues", "gruesa", "gioes"],              price: 1.15, unit: "kg", priceRange: { min: 0.80, max: 1.50 } },
  { id: "chatarra",    name: "Chatarra",         aliases: ["chat", "chatarra", "chatarrra"],         price: 0.25, unit: "kg", priceRange: { min: 0.15, max: 0.40 } },
  // Apareció en la tarjeta 2778 y no estaba en el catálogo: el sistema la marcó
  // como desconocida, que es exactamente lo que debía hacer.
  { id: "chatarra_fina", name: "Chatarra fina",  aliases: ["chatarra fina", "chat fina", "fina"],    price: 0.05, unit: "kg", priceRange: { min: 0.02, max: 0.12 } },
  { id: "cobre",       name: "Cobre",            aliases: ["cobre", "cobre 1ra"],                    price: 6.10, unit: "kg", priceRange: { min: 4.50, max: 7.50 } },
  { id: "bronce",      name: "Bronce",           aliases: ["bronce", "bronc"],                       price: 4.00, unit: "kg", priceRange: { min: 3.00, max: 5.00 } },
  { id: "radiador",    name: "Radiador",         aliases: ["radiador", "radeador", "radiador alu"],  price: 0.90, unit: "kg", priceRange: { min: 0.60, max: 1.20 } },
  { id: "aro",         name: "Aro",              aliases: ["aro", "aros"],                           price: 1.20, unit: "kg", priceRange: { min: 0.60, max: 1.60 } },
  { id: "fundido",     name: "Fundido",          aliases: ["fundido", "fundida"],                    price: 0.15, unit: "kg", priceRange: { min: 0.10, max: 0.30 } },
  { id: "soplado",     name: "Soplado",          aliases: ["soplado", "soplada"],                    price: 0.10, unit: "kg", priceRange: { min: 0.05, max: 0.25 } },
  { id: "carton",      name: "Cartón",           aliases: ["carton", "cart"],                        price: 0.10, unit: "kg", priceRange: { min: 0.03, max: 0.20 } },
  { id: "papel_mixto", name: "Papel mixto",      aliases: ["papel mixto", "mixto", "minte"],         price: 0.10, unit: "kg", priceRange: { min: 0.05, max: 0.60 } },
  { id: "vidrio",      name: "Vidrio",           aliases: ["vidrio", "oidrio"],                      price: 0.03, unit: "kg", priceRange: { min: 0.01, max: 0.10 } },
  { id: "plastico",    name: "Plástico",         aliases: ["plastico", "plast", "plastlo"],          price: 0.18, unit: "kg", priceRange: { min: 0.05, max: 0.40 } },
];

export const DEFAULT_CONFIG: Config = {
  materials: DEFAULT_CATALOG,
  cashRounding: 0.05,
  amountEpsilon: 0.051,
  settlementEpsilon: 1.0,
  weightEpsilon: 0.5,
  // Every truck load in the sample settled between 0,20 and 0,26 per unit.
  bulkPriceRange: { min: 0.12, max: 0.45 },
  currency: "USD",
  photoRetentionDays: 90,
};

/** Truncates an amount the way the counter does: down to the next five cents. */
export function roundCash(amount: number, step: number): number {
  return Math.floor(amount / step + 1e-9) * step;
}
