import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// The SDK's structured-output helper speaks Zod v4, while the domain schema is
// on v3. Rather than migrate everything for one call, the wire schema is written
// in v4 here and the result is validated by the v3 `Document` on the way out —
// which means the conversion is checked twice, by both schemas.
import * as z from "zod/v4";
import type { Config } from "./catalog";
import { extractionPrompt } from "./prompts/extract";
import { Document } from "./schema";

/**
 * The one place a model is called.
 *
 * The wire schema below is flat on purpose: every field is present on every
 * document, and the ones that do not apply come back null or empty. The domain
 * model in schema.ts is a discriminated union, which is the right shape for code
 * to work with but a poor contract to hand a model — unions become `anyOf` in
 * JSON Schema, and an extraction that is *almost* valid is worse than one that
 * fails loudly. `toDocument` converts one into the other, and that conversion is
 * the only place the two shapes meet.
 */

const WireNumber = z.object({
  raw: z.string(),
  value: z.number().nullable(),
  legible: z.boolean(),
  replaces: z.string().nullable(),
});

const WireDocument = z.object({
  kind: z.enum(["tarjeta", "comprobante"]),
  /** Card number on a tarjeta, receipt number on a comprobante. */
  folio: z.string().nullable(),
  date_raw: z.string().nullable(),
  counterparty: z.string().nullable(),

  /** Comprobante only: the material of the whole load. */
  material_raw: z.string().nullable(),
  plate: z.string().nullable(),
  observations: z.string().nullable(),

  /** Tarjeta only; empty on a comprobante. */
  lines: z.array(
    z.object({
      index: z.number().int(),
      quantity: WireNumber.nullable(),
      material_raw: z.string(),
      unit_price: WireNumber.nullable(),
      amount: WireNumber.nullable(),
      note: z.string().nullable(),
    }),
  ),

  /** Comprobante only; all-null on a tarjeta. */
  weighing: z.object({
    gross: WireNumber.nullable(),
    tare: WireNumber.nullable(),
    net: WireNumber.nullable(),
    unit: z.enum(["kg", "lb", "qq", "t"]).nullable(),
    deductions: z.array(
      z.object({ amount: WireNumber.nullable(), reason: z.string().nullable() }),
    ),
    final_net: WireNumber.nullable(),
  }),

  settlement: z.object({
    total: WireNumber.nullable(),
    payments: z.array(
      z.object({
        kind: z.enum(["efectivo", "abono", "transferencia", "debe", "otro"]),
        amount: WireNumber.nullable(),
        raw: z.string(),
      }),
    ),
    owed: WireNumber.nullable(),
  }),

  notes: z.array(z.string()),
});

export type WireDocument = z.infer<typeof WireDocument>;

export function toDocument(wire: WireDocument): Document {
  const settlement = wire.settlement;

  if (wire.kind === "tarjeta") {
    return Document.parse({
      kind: "tarjeta",
      card_number: wire.folio,
      date_raw: wire.date_raw,
      counterparty: wire.counterparty,
      lines: wire.lines.map((l, i) => ({ ...l, index: l.index || i + 1 })),
      settlement,
      notes: wire.notes,
    });
  }

  return Document.parse({
    kind: "comprobante",
    receipt_number: wire.folio,
    date_raw: wire.date_raw,
    counterparty: wire.counterparty,
    material_raw: wire.material_raw,
    plate: wire.plate,
    observations: wire.observations,
    weighing: wire.weighing,
    settlement,
    notes: wire.notes,
  });
}

const MEDIA: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export interface ExtractionResult {
  document: Document;
  usage: { inputTokens: number; outputTokens: number };
  /** What the model returned, before conversion — kept for the audit trail. */
  wire: WireDocument;
}

export interface ExtractOptions {
  model?: string;
  client?: Anthropic;
  /** Fields to re-read, for the independent second pass. See `reread`. */
  focus?: string;
}

export async function extractFromFile(
  file: string,
  config: Config,
  options: ExtractOptions = {},
): Promise<ExtractionResult> {
  const mediaType = MEDIA[path.extname(file).toLowerCase()];
  if (!mediaType) throw new Error(`unsupported image type: ${file}`);
  return extract(await fs.readFile(file), mediaType, config, options);
}

export async function extract(
  image: Buffer,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  config: Config,
  options: ExtractOptions = {},
): Promise<ExtractionResult> {
  const client = options.client ?? new Anthropic();

  const response = await client.messages.parse({
    model: options.model ?? "claude-opus-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(WireDocument) },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: image.toString("base64") },
          },
          {
            type: "text",
            text: options.focus
              ? `${extractionPrompt(config)}\n\nRead this document again from scratch. Pay particular attention to: ${options.focus}`
              : extractionPrompt(config),
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`model refused: ${response.stop_details?.explanation ?? "no reason given"}`);
  }
  const wire = response.parsed_output;
  if (!wire) throw new Error("model returned no parseable document");

  return {
    document: toDocument(wire),
    wire,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
