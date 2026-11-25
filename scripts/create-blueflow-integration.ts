// Creates a PARTNER/Asset Integration for the seed user and mints a one-time
// integration token for it. Used by the Blueflow integration test so an
// external partner (Blueflow) can push assets to
// POST /api/v1/assets/integrationUpload/{token}.
//
// Prints `INTEGRATION_TOKEN=<raw>` on the last line for the CI workflow to
// capture. The token is single-use (consumed on first request), so mint it
// immediately before registering the Blueflow webhook and push a single page.

import { PlatformEnum, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createIntegrationToken } from "@/lib/tokens";

const SEED_USER_EMAIL = "user@example.com";
const INTEGRATION_NAME = "CI Blueflow Test";
// Give the token plenty of headroom for the CI run.
const TOKEN_TTL_SECONDS = 60 * 30; // 30 minutes

async function main() {
  const seedUser = await prisma.user.findUnique({
    where: { email: SEED_USER_EMAIL },
  });
  if (!seedUser) {
    throw new Error("Seed user not found. Did the container run db:seed?");
  }

  // Idempotent: drop any prior CI integration.
  await prisma.integration.deleteMany({
    where: { name: INTEGRATION_NAME, userId: seedUser.id },
  });

  const integration = await prisma.integration.create({
    data: {
      name: INTEGRATION_NAME,
      platform: PlatformEnum.PARTNER,
      // integrationUri / resource live in the platform's config JSON now.
      config: {
        integrationUri: "http://blueflow:8000",
        resource: ResourceType.Asset,
      },
      credentials: null,
      syncEvery: 3600,
      userId: seedUser.id,
      resourceSyncs: { create: { resource: ResourceType.Asset } },
    },
  });

  const token = await createIntegrationToken(
    integration.id,
    ResourceType.Asset,
    TOKEN_TTL_SECONDS,
  );

  console.log(`INTEGRATION_TOKEN=${token}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
