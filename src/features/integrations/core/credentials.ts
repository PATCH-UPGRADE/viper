import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { AuthType } from "@/generated/prisma";
import { authenticationSchema } from "@/lib/schemas";
import { parseAuthenticationJson } from "@/lib/utils";

/**
 * Encryption for `Integration.credentials`, and the shared shape of what goes
 * inside it.
 *
 * The crypto half is deliberately generic — it has no `AuthType` knowledge and
 * encrypts any JSON-serializable blob, so a platform with a credential shape of
 * its own reuses it unchanged.
 *
 * Layout on disk: iv (12 bytes) || auth tag (16 bytes) || ciphertext.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const ALGORITHM = "aes-256-gcm";

let cachedKey: Buffer | null = null;

const getKey = (): Buffer => {
  if (cachedKey) return cachedKey;

  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.",
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CREDENTIAL_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}.`,
    );
  }

  cachedKey = key;
  return key;
};

/**
 * Encrypt an arbitrary JSON-serializable credential blob.
 *
 * Returns a plain `Uint8Array<ArrayBuffer>` rather than a `Buffer`: Node pools
 * Buffer allocations, so a Buffer's `.buffer` is `ArrayBufferLike` and Prisma's
 * `Bytes` field type (`Uint8Array<ArrayBuffer>`) rejects it. The copy detaches
 * it from the pool.
 */
export const encryptCredentials = (
  plaintext: unknown,
): Uint8Array<ArrayBuffer> => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const body = Buffer.concat([
    cipher.update(JSON.stringify(plaintext), "utf8"),
    cipher.final(),
  ]);

  return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), body]));
};

/**
 * Decrypt a blob written by `encryptCredentials`. Throws if the key is wrong or
 * the ciphertext was tampered with — GCM authenticates, so a bad tag is a
 * decryption failure rather than garbage plaintext.
 */
export const decryptCredentials = (blob: Uint8Array): unknown => {
  const buf = Buffer.from(blob);
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error("Stored credentials are too short to be valid ciphertext.");
  }

  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = buf.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
};

/**
 * A platform needing something else declares its own `credentialSchema`
 * and encrypts it with the generic functions above.
 */
export const authCredentialSchema = z.object({
  authType: z.enum(AuthType),
  authentication: authenticationSchema.optional(),
});
export type AuthCredential = z.infer<typeof authCredentialSchema>;

/**
 * The storage form of a credential. `AuthType.None` means there is nothing to
 * protect, so the column stays null — which is exactly what
 * `parseAuthCredential` below reads back as `None`. The two are inverses; keep
 * them that way, so `credentials IS NULL` is the single honest representation
 * of "this integration has no auth".
 */
export const encodeAuthCredential = (
  creds: AuthCredential,
): Uint8Array<ArrayBuffer> | null =>
  creds.authType === AuthType.None ? null : encryptCredentials(creds);

/**
 * Narrow decrypted credentials. A row with no credentials is treated as
 * `AuthType.None` rather than an error — that is a valid configuration.
 */
export const parseAuthCredential = (
  decrypted: unknown,
  integrationId: string,
): AuthCredential => {
  if (decrypted === null || decrypted === undefined) {
    return { authType: AuthType.None };
  }
  const parsed = authCredentialSchema.safeParse(decrypted);
  if (!parsed.success) {
    throw new Error(
      `Integration ${integrationId} has invalid credentials: ${parsed.error.message}`,
    );
  }
  return parsed.data;
};

/**
 * Turn a stored credential into request headers — basic, bearer, or an
 * arbitrary header.
 */
export const authHeaders = (creds: AuthCredential): Record<string, string> => {
  if (creds.authType === AuthType.None) return {};
  const { header, value } = parseAuthenticationJson(creds);
  return { [header]: value };
};
