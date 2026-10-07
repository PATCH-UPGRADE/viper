import { TicketCategory } from "@/generated/prisma";
import prisma from "@/lib/db";

const SAMPLE_CATEGORY_COLORS: { category: TicketCategory; color: string }[] = [
  { category: TicketCategory.PATCH, color: "blue" },
  { category: TicketCategory.CONFIG_CHANGE, color: "purple" },
  { category: TicketCategory.VULN_REMEDIATION, color: "red" },
  { category: TicketCategory.ADVISORY_RESPONSE, color: "amber" },
  { category: TicketCategory.CLINICAL_REVIEW, color: "pink" },
  { category: TicketCategory.FIRMWARE_UPDATE, color: "orange" },
  { category: TicketCategory.NETWORK_REMEDIATION, color: "blue" },
  { category: TicketCategory.NEW_ASSET_PROCUREMENT, color: "purple" },
  { category: TicketCategory.OTHER, color: "slate" },
];

export async function seedCategoryColors() {
  console.log("\n🌱 Seeding category colors...");
  await Promise.all(
    SAMPLE_CATEGORY_COLORS.map((c) =>
      prisma.categoryColor.upsert({
        where: { category: c.category },
        update: { color: c.color },
        create: c,
      }),
    ),
  );
  console.log(`✅ Seeded ${SAMPLE_CATEGORY_COLORS.length} category colors`);
}
