import { PlatformEnum, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";

// Seed CSAF CISA Integration
const CISA_PROVIDED_METADATA_URL =
  "https://www.cisa.gov/sites/default/files/csaf/provider-metadata.json";
export async function seedCsafIntegration(userId: string) {
  console.log("🌱 Seeding CISA CSAF Integration...\n");
  const existing = await prisma.integration.findFirst({
    where: { platform: PlatformEnum.CSAF },
  });
  if (!existing) {
    console.log(`CISA CSAF integration ${existing}`);
    return;
  }

  const integrationUser = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "CISA" },
  });
  const integration = await prisma.integration.create({
    data: {
      name: "CISA",
      platform: PlatformEnum.CSAF,
      config: { provideMetadataUrl: CISA_PROVIDED_METADATA_URL },
      syncEvery: 86400,
      userId,
      integrationUserId: integrationUser.id,
      resourceSyncs: { create: [{ resource: ResourceType.SourceRecord }] },
    },
  });

  console.log(`✅ Seeded CISA CSAF integration ${integration.id}`);
}
