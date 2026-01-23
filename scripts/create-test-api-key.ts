// Creates a 24 hour API key for local dev or CI testing

import { PrismaClient } from "@/generated/prisma";
import { auth } from "../src/lib/auth";

const prisma = new PrismaClient();

const SEED_USER_EMAIL = "user@example.com";
const API_KEY_NAME = "Local / CI Test Key";
const EXPIRY_SECONDS = 60 * 60 * 24; // 24 hours

async function main() {
  // Find seed user and remove any existing keys
  const user = await prisma.user.findUnique({
    where: { email: SEED_USER_EMAIL },
  });

  if (!user) {
    throw new Error(`Seed user not found. Did you run db:seed first?`);
  }

  await prisma.apikey.deleteMany({
    where: {
      userId: user.id,
      name: API_KEY_NAME,
    },
  });

  // Create the key
  const result = await auth.api.createApiKey({
    body: {
      userId: user.id,
      name: API_KEY_NAME,
      expiresIn: EXPIRY_SECONDS,
      rateLimitEnabled: false,
    },
  });

  const rawKey = result.key;

  console.log("\n========================================");
  console.log("🔑 TEST API KEY (LOCAL / CI ONLY)");
  console.log("========================================");
  console.log(`API_KEY=${rawKey}`);
  console.log("========================================\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
