import type { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";

export const DEFAULT_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

function generateRawToken(): string {
  const bytes = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex"); // 64-char hex string
}

async function hashToken(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return Buffer.from(buf).toString("hex");
}

/**
 * Creates a one-time token that lets an integration upload one resource.
 * Returns the RAW token (shown once, never stored).
 */
export async function createIntegrationToken(
  integrationId: string,
  resource: ResourceType,
  ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS,
): Promise<string> {
  const raw = generateRawToken();
  const tokenHash = await hashToken(raw);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await prisma.integrationToken.create({
    data: { integrationId, tokenHash, resource, expiresAt },
  });

  return raw;
}

/**
 * Validates and consumes a one-time token.
 * Returns the integrationId on success, null on failure/expiry.
 */
export async function consumeIntegrationToken(
  raw: string,
  expectedResource: ResourceType,
): Promise<string | null> {
  const tokenHash = await hashToken(raw);

  const record = await prisma.integrationToken.findUnique({
    where: { tokenHash },
  });

  if (!record) return null;
  if (record.expiresAt < new Date()) {
    // Opportunistically clean up this expired record
    await prisma.integrationToken
      .delete({ where: { tokenHash } })
      .catch(() => {});
    return null;
  }

  if (record.resource !== expectedResource) return null;

  // Delete before returning — token is spent. Two requests can both read the
  // token, and only the one that deletes it may use it.
  const { count } = await prisma.integrationToken.deleteMany({
    where: { tokenHash },
  });
  return count === 1 ? record.integrationId : null;
}

/**
 * Deletes all expired tokens. Called by inngest event
 * Returns the number of rows removed.
 */
export async function purgeExpiredTokens(): Promise<number> {
  const { count } = await prisma.integrationToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
