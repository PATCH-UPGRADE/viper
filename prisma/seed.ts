import { join } from "node:path";
import prisma from "@/lib/db";
import { clearDatabase, SEED_USER, seedBaseDemoData } from "./seeds/dev/base";
import { seedTicketDemoData } from "./seeds/dev/ticket-seeds";
import { readSeedOptions } from "./seeds/options";
import { seedProductionData } from "./seeds/production";

const DEV_SEEDS_DIRECTORY = join(__dirname, "seeds", "dev");

async function main() {
  console.log("🌱 Starting database seed...\n");

  try {
    const { scope, onlyTicket } = readSeedOptions(process.env);
    if (scope === "production") {
      await seedProductionData();
      console.log(
        "\n✅ Production data seeded. Demo data skipped (SEED_SCOPE=production).",
      );
      return;
    }

    const shouldClear = process.env.SEED_CLEAR_DB === "true";
    if (shouldClear) {
      await clearDatabase();
    }

    await seedProductionData();
    const seedUser = await seedBaseDemoData();
    await seedTicketDemoData(
      DEV_SEEDS_DIRECTORY,
      { seedUserId: seedUser.id },
      onlyTicket,
    );

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
