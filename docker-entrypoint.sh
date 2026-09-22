#!/bin/sh
set -e

# The database lives on a mounted volume, so it may be empty on first boot:
# migrate it up before serving anything.
prisma migrate deploy --schema prisma/schema.prisma
node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.material.count()
  .then((n) => {
    if (n > 0) return;
    console.log('seeding the material catalog');
    return require('./prisma/seed-data.json').reduce(
      (chain, m) => chain.then(() =>
        db.material.create({
          data: {
            id: m.id, name: m.name, unit: m.unit, price: m.price,
            priceMin: m.priceMin, priceMax: m.priceMax, position: m.position,
            aliases: { create: m.aliases.map((text) => ({ text })) },
          },
        })),
      db.config.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    );
  })
  .catch((e) => console.error(e))
  .finally(() => db.\$disconnect());
"

exec node server.js
