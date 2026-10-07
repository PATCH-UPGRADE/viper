import prisma from "@/lib/db";
import { isDemoDataLoaded, SEED_USER, seedDemoData } from "./seeds/dev";
import { readSeedScope } from "./seeds/options";
import { seedProductionData } from "./seeds/production";

async function seedDemoDataIfMissing(mustSeedDemoData: boolean) {
  const demoDataIsLoaded = await isDemoDataLoaded();
  if (demoDataIsLoaded && !mustSeedDemoData) {
    console.log(
      "\n⏭️  Demo data is already loaded, so it is skipped. Run with SEED_SCOPE=all to load it again, or reset the database with `npx prisma migrate reset`.",
    );
    return;
  }
  await seedDemoData();
}

async function main() {
  console.log("🌱 Starting database seed...\n");

  try {
    const scope = readSeedScope(process.env);
    await seedProductionData();
    if (scope === "production") {
      console.log(
        "\n✅ Production data seeded. Demo data skipped (SEED_SCOPE=production).",
      );
      return;
    }

    const mustSeedDemoData = scope === "all";
    await seedDemoDataIfMissing(mustSeedDemoData);

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
