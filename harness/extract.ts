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

/**
 * A number on the wire, with no nullable fields anywhere.
 *
 * Structured outputs cap how many union-typed parameters a schema may have (16;
 * the nullable-everything version of this schema had 20 and was rejected). The
 * fix turned out to be better than what it replaced: instead of `value: number
 * | null` plus a boolean, a field declares its state outright. "Absent" and
 * "illegible" are genuinely different facts about a document — one says the
 * paper has no such value, the other says it has one and nobody can read it —
 * and the old shape asked the model to express that difference through a null.
 */
const WireNumber = z.object({
  /** The characters as written. Empty when the state is not "read". */
  raw: z.string(),
  /** The parsed number. Ignored unless the state is "read". */
  value: z.number(),
  state: z.enum(["read", "absent", "illegible"]),
  /** The crossed-out text this value replaces, or empty. */
  replaces: z.string(),
});

/**
 * Every field is always present; an empty string means the document does not
 * have it. No nulls, no unions — see WireNumber above for why.
 */
const WireDocument = z.object({
  kind: z.enum(["tarjeta", "comprobante"]),
  /** Card number on a tarjeta, receipt number on a comprobante. */
  folio: z.string(),
  date_raw: z.string(),
  counterparty: z.string(),

  /** Comprobante only: the material of the whole load. */
  material_raw: z.string(),
  plate: z.string(),
  observations: z.string(),

  /** Tarjeta only; empty on a comprobante. */
  lines: z.array(
    z.object({
      index: z.number().int(),
      quantity: WireNumber,
      material_raw: z.string(),
      unit_price: WireNumber,
      amount: WireNumber,
      note: z.string(),
    }),
  ),

  /** Comprobante only; all "absent" on a tarjeta. */
  weighing: z.object({
    gross: WireNumber,
    tare: WireNumber,
    net: WireNumber,
    unit: z.enum(["kg", "lb", "qq", "t", "unstated"]),
    deductions: z.array(z.object({ amount: WireNumber, reason: z.string() })),
    final_net: WireNumber,
  }),

  settlement: z.object({
    total: WireNumber,
    payments: z.array(
      z.object({
        kind: z.enum(["efectivo", "abono", "transferencia", "debe", "otro"]),
        amount: WireNumber,
        raw: z.string(),
      }),
    ),
    owed: WireNumber,
  }),

  notes: z.array(z.string()),
});

export type WireDocument = z.infer<typeof WireDocument>;

type Wire = z.infer<typeof WireNumber>;

/** Wire state to the domain's shape: absent becomes null, illegible keeps the
 *  field but refuses a value. */
const field = (w: Wire) =>
  w.state === "absent"
    ? null
    : {
        raw: w.raw,
        value: w.state === "read" ? w.value : null,
        legible: w.state === "read",
        replaces: w.replaces === "" ? null : w.replaces,
      };

const text = (s: string) => (s.trim() === "" ? null : s);

export function toDocument(wire: WireDocument): Document {
  const settlement = {
    total: field(wire.settlement.total),
    payments: wire.settlement.payments.map((p) => ({
      kind: p.kind,
      amount: field(p.amount),
      raw: p.raw,
    })),
    owed: field(wire.settlement.owed),
  };

  if (wire.kind === "tarjeta") {
    return Document.parse({
      kind: "tarjeta",
      card_number: text(wire.folio),
      date_raw: text(wire.date_raw),
      counterparty: text(wire.counterparty),
      lines: wire.lines.map((l, i) => ({
        index: l.index || i + 1,
        quantity: field(l.quantity),
        material_raw: l.material_raw,
        unit_price: field(l.unit_price),
        amount: field(l.amount),
        note: text(l.note),
      })),
      settlement,
      notes: wire.notes,
    });
  }

  return Document.parse({
    kind: "comprobante",
    receipt_number: text(wire.folio),
    date_raw: text(wire.date_raw),
    counterparty: text(wire.counterparty),
    material_raw: text(wire.material_raw),
    plate: text(wire.plate),
    observations: text(wire.observations),
    weighing: {
      gross: field(wire.weighing.gross),
      tare: field(wire.weighing.tare),
      net: field(wire.weighing.net),
      unit: wire.weighing.unit === "unstated" ? null : wire.weighing.unit,
      deductions: wire.weighing.deductions.map((d) => ({
        amount: field(d.amount),
        reason: text(d.reason),
      })),
      final_net: field(wire.weighing.final_net),
    },
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
