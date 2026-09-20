import { PrismaClient } from "@prisma/client";
import { DEFAULT_CATALOG, DEFAULT_CONFIG } from "../harness/catalog";

/**
 * Seeds the catalog a yard starts from. It is a starting point, not a fixture:
 * the configuration screen is where a yard makes it theirs, and most will rename
 * things within the first hour.
 */
const db = new PrismaClient();

async function main() {
  await db.config.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      tolerancePct: DEFAULT_CONFIG.tolerancePct,
      priceDivergencePct: DEFAULT_CONFIG.priceDivergencePct,
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
        priceUnit: material.priceUnit,
        position,
        aliases: { create: material.aliases.map((text) => ({ text })) },
      },
    });
  }

  const count = await db.material.count();
  console.log(`catálogo listo: ${count} materiales`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
