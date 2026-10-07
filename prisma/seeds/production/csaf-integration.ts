import { PlatformEnum, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";

const CISA_PROVIDER_METADATA_URL =
  "https://www.cisa.gov/sites/default/files/csaf/provider-metadata.json";
const SECONDS_IN_ONE_DAY = 86400;

export async function seedCsafIntegration() {
  console.log("\n🌱 Seeding the CISA CSAF integration...");

  const existingCsafIntegration = await prisma.integration.findFirst({
    where: { platform: PlatformEnum.CSAF },
    select: { id: true, name: true },
  });
  if (existingCsafIntegration) {
    console.log(
      `✅ CSAF integration "${existingCsafIntegration.name}" already exists, so it is left unchanged`,
    );
    return;
  }

  const cisaIntegration = await prisma.$transaction(async (transaction) => {
    const cisaIntegrationUser = await transaction.user.create({
      data: { id: crypto.randomUUID(), name: "CISA" },
    });
    return transaction.integration.create({
      data: {
        name: "CISA",
        platform: PlatformEnum.CSAF,
        config: { providerMetadataUrl: CISA_PROVIDER_METADATA_URL },
        syncEvery: SECONDS_IN_ONE_DAY,
        userId: cisaIntegrationUser.id,
        integrationUserId: cisaIntegrationUser.id,
        resourceSyncs: { create: [{ resource: ResourceType.SourceRecord }] },
      },
    });
  });

  console.log(`✅ Created the CISA CSAF integration ${cisaIntegration.id}`);
}
