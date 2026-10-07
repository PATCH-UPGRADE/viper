import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import prisma from "@/lib/db";

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    throw new Error(
      "Usage: npm run db:export-manufacturers -- <output-file.json>",
    );
  }

  const manufacturers = await prisma.manufacturer.findMany({
    select: {
      canonicalName: true,
      canonicalDisplayName: true,
      hasCpe: true,
      nameMappings: true,
    },
    orderBy: { canonicalName: "asc" },
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manufacturers, null, 2)}\n`);
  console.log(
    `✅ Wrote ${manufacturers.length} manufacturers to ${outputPath}`,
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
