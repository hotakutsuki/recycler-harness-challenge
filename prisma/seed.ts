import { PrismaClient } from "@prisma/client";
import { DEFAULT_CATALOG, DEFAULT_CONFIG } from "../harness/catalog";

/**
 * Seeds the catalog a yard starts from — the materials and prices read off the
 * real paperwork. A starting point, not a fixture: the configuration screen is
 * where a yard makes it theirs, and most will change something within the hour.
 */
const db = new PrismaClient();

async function main() {
  await db.config.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      cashRounding: DEFAULT_CONFIG.cashRounding,
      bulkPriceMin: DEFAULT_CONFIG.bulkPriceRange.min,
      bulkPriceMax: DEFAULT_CONFIG.bulkPriceRange.max,
      currency: DEFAULT_CONFIG.currency,
      photoRetentionDays: DEFAULT_CONFIG.photoRetentionDays,
    },
  });

  for (const [position, material] of DEFAULT_CATALOG.entries()) {
    await db.material.upsert({
      where: { id: material.id },
      update: {},
      create: {
        id: material.id,
        name: material.name,
        price: material.price,
        unit: material.unit,
        priceMin: material.priceRange.min,
        priceMax: material.priceRange.max,
        position,
        aliases: { create: material.aliases.map((text) => ({ text })) },
      },
    });
  }

  const count = await db.material.count();
  console.log(`catálogo listo: ${count} materiales`);
}

/**
 * The container seeds from a JSON copy of this same catalog, because the
 * runtime image has no TypeScript runner in it. Writing it here keeps the two
 * from drifting: there is one catalog, and this is its only export.
 */
async function writeSeedData() {
  const fs = await import("node:fs/promises");
  await fs.writeFile(
    new URL("./seed-data.json", import.meta.url),
    JSON.stringify(
      DEFAULT_CATALOG.map((m, position) => ({
        id: m.id, name: m.name, unit: m.unit, price: m.price,
        priceMin: m.priceRange.min, priceMax: m.priceRange.max,
        aliases: m.aliases, position,
      })),
      null,
      2,
    ) + "\n",
  );
}

main()
  .then(writeSeedData)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
