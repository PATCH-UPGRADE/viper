import { readFile } from "node:fs/promises";
import prisma from "@/lib/db";
import { manufacturerFileSchema } from "@/lib/manufacturer-catalog";
import {
  logManufacturerUpsertPlan,
  upsertManufacturers,
} from "@/lib/manufacturer-upsert";

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error(
      "Usage: npm run db:upsert-manufacturers -- <input-file.json>",
    );
  }

  const fileContents = await readFile(inputPath, "utf8");
  const manufacturersInFile = manufacturerFileSchema.parse(
    JSON.parse(fileContents),
  );
  const plan = await upsertManufacturers(manufacturersInFile);
  logManufacturerUpsertPlan(plan);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
