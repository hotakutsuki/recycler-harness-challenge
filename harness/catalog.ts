import type { Unit } from "./schema";

/**
 * The yard's material catalog and the settings that govern validation.
 *
 * In the running app this comes from the configuration screen and the database.
 * Here it is plain data, passed into the pure functions as an argument, so that
 * normalization and validation never reach for a global — which is what lets the
 * eval runner drive them with whatever catalog a given yard uses.
 */

export interface Material {
  id: string;
  /** Canonical name, shown in the UI and in reports. */
  name: string;
  /** How the material is actually written on sheets. Matched case- and accent-insensitively. */
  aliases: string[];
  /** Purchase price per `priceUnit`, in USD. */
  price: number;
  /**
   * The unit the price is quoted in, which is independent of the unit a given
   * sheet weighs in: copper is priced per pound and may be weighed in quintales.
   */
  priceUnit: Unit;
}

export interface Config {
  materials: Material[];
  /** Allowed gap between the sum of the lines and the truck's net weight. */
  tolerancePct: number;
  /** How far a price written on a sheet may stray from the catalog before it is flagged. */
  priceDivergencePct: number;
  /** Rounding slack for money, in USD: handwritten amounts are rounded to the cent. */
  amountEpsilon: number;
  /** Rounding slack for weights, in kg. */
  weightEpsilon: number;
  currency: string;
  photoRetentionDays: number;
}

export const DEFAULT_CATALOG: Material[] = [
  { id: "chatarra_liviana",   name: "Chatarra liviana",   aliases: ["chat liv", "chat. liv.", "chatarra liv", "liviana"],        price: 0.12, priceUnit: "lb" },
  { id: "chatarra_pesada",    name: "Chatarra pesada",    aliases: ["chat pes", "chat. pes.", "pesada"],                          price: 0.15, priceUnit: "lb" },
  { id: "chatarra_automotriz",name: "Chatarra automotriz",aliases: ["chat auto", "chat. auto.", "autopartes", "automotriz"],      price: 0.10, priceUnit: "lb" },
  { id: "papel",              name: "Papel",              aliases: ["pap", "pap."],                                               price: 0.05, priceUnit: "lb" },
  { id: "carton",             name: "Cartón",             aliases: ["cart", "cart.", "carton"],                                   price: 0.04, priceUnit: "lb" },
  { id: "cobre",              name: "Cobre",              aliases: ["cobre 1ra", "cobre primera"],                                price: 3.20, priceUnit: "lb" },
  { id: "hierro",             name: "Hierro",             aliases: ["fierro"],                                                    price: 0.13, priceUnit: "lb" },
  { id: "plastico",           name: "Plástico",           aliases: ["plast", "plast.", "plástico", "plastico"],                   price: 0.18, priceUnit: "kg" },
  { id: "vidrio",             name: "Vidrio",             aliases: [],                                                            price: 0.03, priceUnit: "kg" },
];

export const DEFAULT_CONFIG: Config = {
  materials: DEFAULT_CATALOG,
  tolerancePct: 10,
  priceDivergencePct: 10,
  amountEpsilon: 0.05,
  weightEpsilon: 0.5,
  currency: "USD",
  photoRetentionDays: 90,
};
