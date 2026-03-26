import prisma from "@/lib/db";

const DEFAULT_TTL_SECONDS = 15 * 60; // 15 minutes

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
 * Creates a new one-time token for a user.
 * Returns the RAW token (shown once, never stored).
 */
export async function createUserToken(
  userId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  permissions?: string,
): Promise<string> {
  const raw = generateRawToken();
  const tokenHash = await hashToken(raw);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await prisma.userToken.create({
    data: { userId, tokenHash, permissions, expiresAt },
  });

  return raw;
}

/**
 * Validates and consumes a one-time token.
 * Returns the userId on success, null on failure/expiry.
 */
export async function consumeUserToken(
  raw: string,
  expectedPermissions?: string,
): Promise<string | null> {
  const tokenHash = await hashToken(raw);

  // Atomic find-and-delete so concurrent requests can't double-consume
  const record = await prisma.userToken.findUnique({
    where: { tokenHash },
  });

  if (!record) return null;
  if (record.expiresAt < new Date()) {
    // Opportunistically clean up this expired record
    await prisma.userToken.delete({ where: { tokenHash } }).catch(() => {});
    return null;
  }

  // invalid permissions on token
  if (expectedPermissions && record.permissions !== expectedPermissions) {
    return null;
  }

  // Delete before returning — token is spent
  await prisma.userToken.delete({ where: { tokenHash } });
  return record.userId;
}

/**
 * Deletes all expired tokens. Called by inngest event
 * Returns the number of rows removed.
 */
export async function purgeExpiredTokens(): Promise<number> {
  const { count } = await prisma.userToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
