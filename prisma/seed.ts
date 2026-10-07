import prisma from "@/lib/db";
import { clearDatabase, SEED_USER, seedBaseDemoData } from "./seeds/dev/base";
import { readSeedScope } from "./seeds/options";
import { seedProductionData } from "./seeds/production";

async function main() {
  console.log("🌱 Starting database seed...\n");

  try {
    const seedScope = readSeedScope(process.env);
    if (seedScope === "production") {
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
    await seedBaseDemoData();

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
