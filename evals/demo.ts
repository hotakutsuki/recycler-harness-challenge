import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { db } from "../lib/db";
import { extractDocument, usingStub } from "../lib/extractor";
import { check, loadConfig, persist } from "../lib/pipeline";
import { save } from "../lib/storage";
import { isBlocking } from "../harness/validate";

/**
 * Loads the dataset documents into the app, so the review screen and the report
 * have something real in them on a fresh clone.
 *
 * Runs the same pipeline the app does — nothing is inserted straight into the
 * database. With EXTRACTOR=stub the reading is replayed from the ground truth,
 * so this costs nothing; with a funded key it is the model doing the reading and
 * the result is whatever the model actually saw.
 *
 *   npm run demo            # every document, stubbed
 *   npm run demo -- 6       # just the first six
 */

const FOTOS = path.join(process.cwd(), "evals", "dataset", "fotos");
const limit = Number(process.argv[2] ?? "0");

/** Two left uncommitted on purpose: an inbox that is always empty shows nothing. */
const LEAVE_PENDING = new Set(["doc-26", "doc-27"]);

async function main() {
  if (!fs.existsSync(FOTOS)) {
    console.error(`no hay fotos en ${FOTOS}`);
    process.exit(1);
  }

  const files = fs.readdirSync(FOTOS).filter((f) => f.endsWith(".jpeg")).sort();
  const chosen = limit > 0 ? files.slice(0, limit) : files;

  console.log(
    `cargando ${chosen.length} documentos${usingStub() ? " (modo de prueba, sin llamar al modelo)" : " con el modelo"}`,
  );

  const config = await loadConfig();
  let committed = 0;
  let pending = 0;

  for (const file of chosen) {
    const id = path.parse(file).name;
    const bytes = fs.readFileSync(path.join(FOTOS, file));
    const photo = await save(new File([new Uint8Array(bytes)], file, { type: "image/jpeg" }));
    const sheet = await db.sheet.create({ data: { photoPath: photo.filename } });

    try {
      const { document } = await extractDocument(bytes, "image/jpeg", config);
      const { normalized, flags } = await check(document, sheet.id, config);

      const commit = !isBlocking(flags) && !LEAVE_PENDING.has(id);
      if (commit) await persist(sheet.id, normalized);

      await db.sheet.update({
        where: { id: sheet.id },
        data: {
          status: commit ? "committed" : isBlocking(flags) ? "needs_review" : "ready",
          committedAt: commit ? new Date() : null,
          rawExtraction: JSON.stringify(document),
          flags: JSON.stringify(flags),
        },
      });

      commit ? committed++ : pending++;
      console.log(
        `  ${id}  ${normalized.folio ?? "—"}  ${commit ? "confirmado" : "pendiente"}` +
          (flags.length ? `  (${flags.map((f) => f.code).join(", ")})` : ""),
      );
    } catch (error) {
      await db.sheet.update({
        where: { id: sheet.id },
        data: { status: "failed", error: error instanceof Error ? error.message : String(error) },
      });
      console.log(`  ${id}  falló: ${error instanceof Error ? error.message : error}`);
      pending++;
    }
  }

  console.log(`\n${committed} confirmados, ${pending} esperando a una persona.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
