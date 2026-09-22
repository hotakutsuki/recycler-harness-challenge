import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Config } from "@/harness/catalog";
import { extract, type ExtractionResult } from "@/harness/extract";
import { Document } from "@/harness/schema";

/**
 * Picks the extractor: the real model, or a stub that replays the ground truth.
 *
 * The stub exists because the API key has no credit yet and the rest of the
 * system — the worker, the review screen, the reports — can be built and checked
 * end to end without it. It is not a fake success: it only answers for photos
 * that are literally the dataset images (matched by content hash), and refuses
 * anything else with a message saying so. Every screen it feeds shows a badge.
 *
 * Set EXTRACTOR=stub to use it. Anything else calls the model.
 */

const DATASET = path.join(process.cwd(), "evals", "dataset");

export const usingStub = () => process.env.EXTRACTOR === "stub";

let index: Map<string, string> | null = null;

/** sha1 of each dataset photo -> its document id. Built once, lazily. */
function photoIndex(): Map<string, string> {
  if (index) return index;
  index = new Map();

  const photos = path.join(DATASET, "fotos");
  if (!fs.existsSync(photos)) return index;

  for (const file of fs.readdirSync(photos)) {
    const hash = crypto.createHash("sha1").update(fs.readFileSync(path.join(photos, file))).digest("hex");
    index.set(hash, path.parse(file).name);
  }
  return index;
}

function stubExtract(image: Buffer): ExtractionResult {
  const hash = crypto.createHash("sha1").update(image).digest("hex");
  const id = photoIndex().get(hash);

  if (!id) {
    throw new Error(
      "EXTRACTOR=stub only answers for photos from evals/dataset/fotos. " +
        "This image is not one of them — set a funded ANTHROPIC_API_KEY and unset EXTRACTOR to read it for real.",
    );
  }

  const record = JSON.parse(
    fs.readFileSync(path.join(DATASET, `${id}.json`), "utf8"),
  ) as { extraction: unknown };

  const document = Document.parse(record.extraction);
  return {
    document,
    wire: document as never,
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

export async function extractDocument(
  image: Buffer,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  config: Config,
  focus?: string,
): Promise<ExtractionResult> {
  // The stub replays one fixed reading, so a second pass against it always
  // agrees. That is not evidence of anything, and the review screen says so.
  if (usingStub()) return stubExtract(image);
  return extract(image, mediaType, config, focus ? { focus } : {});
}
