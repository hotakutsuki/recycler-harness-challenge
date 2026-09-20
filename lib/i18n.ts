/**
 * Two languages, one flat dictionary, no framework.
 *
 * Spanish is the source language: it is what the person using this actually
 * speaks, and the yard's vocabulary does not translate anyway. English exists
 * because the people reviewing this work do not read Spanish, and an interface
 * they cannot read cannot be judged.
 *
 * What never gets translated: the material catalog (that is the yard's data, not
 * UI copy) and the `raw` transcription of what is written on a sheet.
 */

export const LANGUAGES = ["es", "en"] as const;
export type Lang = (typeof LANGUAGES)[number];
export const DEFAULT_LANG: Lang = "es";
export const LANG_COOKIE = "lang";

type Dict = Record<string, string>;

const es: Dict = {
  "app.name": "RecycleOps",
  "app.tagline": "Hojas de pesaje",

  "nav.capture": "Capturar",
  "nav.review": "Revisar",
  "nav.reports": "Reportes",
  "nav.settings": "Configuración",

  "lang.label": "Idioma",
  "lang.es": "Español",
  "lang.en": "English",

  "capture.button": "Subir hoja",
  "capture.hint": "Toma una foto de la hoja completa, de frente y con buena luz. Puedes subir varias seguidas.",
  "capture.empty": "Todavía no has subido ninguna hoja.",
  "capture.uploading": "subiendo…",
  "capture.saved": "guardada",
  "capture.failed": "falló",
  "capture.wip": "Por ahora la hoja solo se guarda. La lectura automática, la revisión y los reportes se conectan en los siguientes pasos.",
  "common.wip": "En construcción.",
  "common.demo": "Demo",
  "common.save": "Guardar",
  "common.saved": "Cambios guardados",
  "common.cancel": "Cancelar",
  "common.add": "Agregar",
  "common.remove": "Quitar",

  "settings.title": "Configuración",
  "settings.materials": "Materiales y precios",
  "settings.materials.hint": "El precio es lo que la recicladora paga por unidad. La unidad de precio no tiene que ser la misma en que se pesa: el cobre se paga por libra aunque llegue en quintales.",
  "settings.material": "Material",
  "settings.aliases": "Cómo se escribe en las hojas",
  "settings.aliases.hint": "Separa con comas. Sirve para que «chat liv» se reconozca solo.",
  "settings.price": "Precio",
  "settings.priceUnit": "Por",
  "settings.checks": "Validaciones",
  "settings.tolerance": "Tolerancia entre el detalle y el peso del camión",
  "settings.tolerance.hint": "Siempre hay diferencia por tierra, humedad y merma. Por encima de este porcentaje, la hoja pasa a revisión.",
  "settings.priceDivergence": "Diferencia de precio tolerada",
  "settings.priceDivergence.hint": "Si el precio escrito en la hoja se aparta más que esto del precio configurado, se marca la línea.",
  "settings.retention": "Conservar las fotos",
  "settings.retention.hint": "Pasado ese tiempo se borra la foto y se conserva lo extraído.",
  "settings.days": "días",
  "settings.unit.kg": "kilo",
  "settings.unit.lb": "libra",
  "settings.unit.qq": "quintal",
  "settings.unit.t": "tonelada",

  "flag.blocking": "Bloqueante",
  "flag.warning": "Aviso",
  "flag.line": "línea {line}",
  "flag.V1": "Los pesos de la línea no cuadran: {gross} menos el descuento de {deduction} da {expected} kg, pero la hoja dice {written} kg.",
  "flag.V2": "El peso del camión no cuadra: {gross} menos la tara de {tare} da {expected} kg, pero la hoja dice {written} kg.",
  "flag.V3": "Los pesos del detalle suman {lines} kg, pero el camión neto es {truck} kg (diferencia {diffPct} %, tolerancia {tolerancePct} %).",
  "flag.V4": "La cuenta no da: debería ser {expected}, pero la hoja dice {written}.",
  "flag.V5": "«{material}» no está en el catálogo de materiales.",
  "flag.V5.fuzzy": "«{material}» no está escrito igual que en el catálogo. ¿Es {suggestion}?",
  "flag.V6": "A «{material}» le falta la unidad, así que no se puede convertir el peso.",
  "flag.V7": "Dato poco creíble, conviene revisarlo.",
  "flag.V7.date": "No se pudo leer la fecha con seguridad.",
  "flag.V8": "Parece un duplicado de la hoja {folio}: misma fecha, proveedor, placa y peso.",
  "flag.V9": "Hay un dato que no se puede leer en «{material}».",
  "flag.PRECIO": "El precio de {material} en la hoja es {written} y el configurado es {catalog}.",
};

const en: Dict = {
  "app.name": "RecycleOps",
  "app.tagline": "Weighing sheets",

  "nav.capture": "Capture",
  "nav.review": "Review",
  "nav.reports": "Reports",
  "nav.settings": "Settings",

  "lang.label": "Language",
  "lang.es": "Español",
  "lang.en": "English",

  "capture.button": "Upload sheet",
  "capture.hint": "Photograph the whole sheet, straight on and in good light. You can upload several in a row.",
  "capture.empty": "No sheets uploaded yet.",
  "capture.uploading": "uploading…",
  "capture.saved": "saved",
  "capture.failed": "failed",
  "capture.wip": "For now the sheet is only stored. Extraction, review and reports are wired in next.",
  "common.wip": "Under construction.",
  "common.demo": "Demo",
  "common.save": "Save",
  "common.saved": "Changes saved",
  "common.cancel": "Cancel",
  "common.add": "Add",
  "common.remove": "Remove",

  "settings.title": "Settings",
  "settings.materials": "Materials and prices",
  "settings.materials.hint": "The price is what the yard pays per unit. The price unit need not match the weighing unit: copper is paid by the pound even when it arrives in quintales.",
  "settings.material": "Material",
  "settings.aliases": "How it is written on sheets",
  "settings.aliases.hint": "Comma-separated. This is what lets “chat liv” resolve on its own.",
  "settings.price": "Price",
  "settings.priceUnit": "Per",
  "settings.checks": "Validation",
  "settings.tolerance": "Tolerance between the detail and the truck weight",
  "settings.tolerance.hint": "There is always a gap from dirt, moisture and losses while sorting. Above this percentage the sheet goes to review.",
  "settings.priceDivergence": "Allowed price divergence",
  "settings.priceDivergence.hint": "If a price written on a sheet strays further than this from the configured one, the line is flagged.",
  "settings.retention": "Keep photos for",
  "settings.retention.hint": "After that the photo is deleted and the extracted data is kept.",
  "settings.days": "days",
  "settings.unit.kg": "kilo",
  "settings.unit.lb": "pound",
  "settings.unit.qq": "quintal (100 lb)",
  "settings.unit.t": "tonne",

  "flag.blocking": "Blocking",
  "flag.warning": "Warning",
  "flag.line": "line {line}",
  "flag.V1": "The line does not add up: {gross} less the {deduction} deduction is {expected} kg, but the sheet says {written} kg.",
  "flag.V2": "The truck weights do not add up: {gross} less the {tare} tare is {expected} kg, but the sheet says {written} kg.",
  "flag.V3": "The detail adds up to {lines} kg, but the truck net is {truck} kg ({diffPct} % apart, tolerance {tolerancePct} %).",
  "flag.V4": "The arithmetic is off: it should be {expected}, but the sheet says {written}.",
  "flag.V5": "“{material}” is not in the material catalog.",
  "flag.V5.fuzzy": "“{material}” is not written the way the catalog has it. Did they mean {suggestion}?",
  "flag.V6": "“{material}” has no unit, so its weight cannot be converted.",
  "flag.V7": "Implausible value, worth a look.",
  "flag.V7.date": "The date could not be read with confidence.",
  "flag.V8": "Looks like a duplicate of sheet {folio}: same date, supplier, plate and weight.",
  "flag.V9": "A value on “{material}” cannot be read.",
  "flag.PRECIO": "{material} is priced at {written} on the sheet; the configured price is {catalog}.",
};

const DICTS: Record<Lang, Dict> = { es, en };

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Builds a translate function. Missing keys fall back to Spanish, then to the key
 *  itself — a visible key in the UI is a bug report, which beats an empty label. */
export function translator(lang: Lang): Translate {
  return (key, params) => {
    const template = DICTS[lang][key] ?? DICTS.es[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}
