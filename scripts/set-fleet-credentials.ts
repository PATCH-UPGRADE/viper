// Stores teamplay Fleet portal credentials on the seeded FLEET integration so a
// developer can exercise the asset sync locally. Reads FLEET_USERNAME /
// FLEET_PASSWORD / CREDENTIAL_ENCRYPTION_KEY from the environment:
//
//   npm run db:set-fleet-credentials
//
// The AES-256-GCM layout (iv 12 bytes || auth tag 16 bytes || ciphertext)
// mirrors src/features/integrations/core/credentials.ts, which this script
// cannot import (server-only). If decryption fails on the next sync, the two
// have drifted — fix them together.

import { createCipheriv, randomBytes } from "node:crypto";
import { AuthType, PlatformEnum } from "@/generated/prisma";
import prisma from "@/lib/db";

function encrypt(plaintext: unknown): Uint8Array<ArrayBuffer> {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(plaintext), "utf8"),
    cipher.final(),
  ]);
  return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), body]));
}

async function main() {
  const username = process.env.FLEET_USERNAME;
  const password = process.env.FLEET_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "Set FLEET_USERNAME and FLEET_PASSWORD -- run with --env-file=.env",
    );
  }

  const integration = await prisma.integration.findFirstOrThrow({
    where: { platform: PlatformEnum.FLEET },
  });

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      credentials: encrypt({
        authType: AuthType.Basic,
        authentication: { username, password },
      }),
    },
  });

  console.log(`Stored Fleet credentials on ${integration.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
