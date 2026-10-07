import prisma from "@/lib/db";
import {
  createOrGetSeedUser,
  isBaseDemoDataLoaded,
  SEED_USER,
  seedBaseDemoData,
} from "./seeds/dev/base";
import { loadTicketSeeds, runTicketSeeds } from "./seeds/dev/ticket-seeds";
import { readSeedOptions } from "./seeds/options";
import { seedProductionData } from "./seeds/production";

async function seedBaseDemoDataIfMissing(mustSeedBaseDemoData: boolean) {
  const baseDemoDataIsLoaded = await isBaseDemoDataLoaded();
  if (baseDemoDataIsLoaded && !mustSeedBaseDemoData) {
    console.log(
      "\n⏭️  Base demo data is already loaded, so it is skipped. Run with SEED_SCOPE=all to load it again, or reset the database with `npx prisma migrate reset`.",
    );
    return createOrGetSeedUser();
  }
  return seedBaseDemoData();
}

async function main() {
  console.log("🌱 Starting database seed...\n");

  try {
    const { scope, onlyTickets } = readSeedOptions(process.env);
    if (scope === "production") {
      await seedProductionData();
      console.log(
        "\n✅ Production data seeded. Demo data skipped (SEED_SCOPE=production).",
      );
      return;
    }

    const ticketSeeds = await loadTicketSeeds(onlyTickets);

    await seedProductionData();
    const mustSeedBaseDemoData = scope === "all";
    const seedUser = await seedBaseDemoDataIfMissing(mustSeedBaseDemoData);
    await runTicketSeeds(ticketSeeds, { seedUserId: seedUser.id });

    console.log("\n✅ Database seeding completed successfully!");
    console.log(`\n📧 Login with: ${SEED_USER.email} / ${SEED_USER.password}`);
  } catch (error) {
    console.error("\n❌ Error during database seeding:", error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
