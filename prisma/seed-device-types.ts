/**
 * Seeds the VIPER device types, and links the known teamplay Fleet products to
 * them. Safe to run more than one time, on any database: it only upserts.
 *
 * Run:    npm run db:seed-device-types
 */
import prisma from "@/lib/db";
import {
  seedDeviceTypes,
  seedFleetProducts,
} from "./seeds/production/device-types";

async function main() {
  const idBySlug = await seedDeviceTypes();
  const fleetProducts = await seedFleetProducts(idBySlug);
  console.log(
    `Seeded ${idBySlug.size} device types and ${fleetProducts} Fleet products`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
