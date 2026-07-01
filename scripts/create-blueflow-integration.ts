// Creates a PARTNER/Asset Integration for the seed user and mints a one-time
// integration token for it. Used by the Blueflow integration test so an
// external partner (Blueflow) can push assets to
// POST /api/v1/assets/integrationUpload/{token}.
//
// Prints `INTEGRATION_TOKEN=<raw>` on the last line for the CI workflow to
// capture. The token is single-use (consumed on first request), so mint it
// immediately before registering the Blueflow webhook and push a single page.

import { AuthType, IntegrationType, ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createUserToken } from "@/lib/tokens";

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

  // Idempotent: drop any prior CI integration (cascades to its integrationUser).
  const existing = await prisma.integration.findFirst({
    where: { name: INTEGRATION_NAME, userId: seedUser.id },
  });
  if (existing) {
    await prisma.user
      .delete({ where: { id: existing.integrationUserId } })
      .catch(() => {});
  }

  // Mirror integrations.create: an Integration owns a dedicated integrationUser
  // whose id the token is minted for.
  const integration = await prisma.$transaction(async (tx) => {
    const integrationUser = await tx.user.create({
      data: { id: crypto.randomUUID(), name: INTEGRATION_NAME },
    });
    return tx.integration.create({
      data: {
        name: INTEGRATION_NAME,
        platform: "Blueflow",
        integrationUri: "http://blueflow:8000",
        integrationType: IntegrationType.PARTNER,
        authType: AuthType.None,
        resourceType: ResourceType.Asset,
        syncEvery: 3600,
        userId: seedUser.id,
        integrationUserId: integrationUser.id,
      },
    });
  });

  const token = await createUserToken(
    integration.integrationUserId,
    TOKEN_TTL_SECONDS,
    ResourceType.Asset,
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
