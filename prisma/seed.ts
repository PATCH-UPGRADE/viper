import prisma from "@/lib/db";
import {
  clearDatabase,
  createOrGetSeedUser,
  SEED_USER,
  seedBaseDemoData,
} from "./seeds/dev/base";
import { loadTicketSeeds, runTicketSeeds } from "./seeds/dev/ticket-seeds";
import { readSeedOptions } from "./seeds/options";
import { seedProductionData } from "./seeds/production";

async function main() {
  console.log("🌱 Starting database seed...\n");

  try {
    const { scope, onlyTicket, shouldClearDemoTables } = readSeedOptions(
      process.env,
    );
    if (scope === "production") {
      await seedProductionData();
      console.log(
        "\n✅ Production data seeded. Demo data skipped (SEED_SCOPE=production).",
      );
      return;
    }

    const ticketSeeds = await loadTicketSeeds(onlyTicket);

    if (shouldClearDemoTables) {
      await clearDatabase();
    }

    await seedProductionData();
    const seedUser = onlyTicket
      ? await createOrGetSeedUser()
      : await seedBaseDemoData();
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
