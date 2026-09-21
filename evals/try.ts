import "dotenv/config";
import path from "node:path";
import { DEFAULT_CONFIG } from "../harness/catalog";
import { extractFromFile } from "../harness/extract";
import { normalize } from "../harness/normalize";
import { validate } from "../harness/validate";
import { describe as describeFlag } from "../harness/messages";
import { translator } from "../lib/i18n";

/** Extracts one photo and prints what the harness makes of it. */
const file = process.argv[2];
if (!file) {
  console.error("uso: npx tsx evals/try.ts <ruta-a-la-foto>");
  process.exit(1);
}

const t = translator("es");

async function main() {
  const started = Date.now();
  const { document, usage } = await extractFromFile(path.resolve(file!), DEFAULT_CONFIG);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(JSON.stringify(document, null, 2));

  const flags = validate(normalize(document, DEFAULT_CONFIG), DEFAULT_CONFIG);
  console.log(`\n${flags.length === 0 ? "sin marcas" : "marcas:"}`);
  for (const flag of flags) {
    const { text, where, severity } = describeFlag(flag, t);
    console.log(`  ${flag.code} · ${severity}${where ? ` · ${where}` : ""} — ${text}`);
  }
  console.log(`\n${seconds}s · ${usage.inputTokens} tokens de entrada · ${usage.outputTokens} de salida`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
