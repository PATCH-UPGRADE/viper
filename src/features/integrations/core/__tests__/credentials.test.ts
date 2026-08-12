import { beforeAll, describe, expect, it } from "vitest";
import { AuthType } from "@/generated/prisma";
import {
  decryptCredentials,
  encodeAuthCredential,
  encryptCredentials,
  parseAuthCredential,
} from "../credentials";

const SECRET = {
  authType: "Bearer" as const,
  authentication: { token: "s3cr3t-value" },
};

beforeAll(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY ??= Buffer.from(
    "test-only-not-a-secret-key-32byt",
    "utf8",
  ).toString("base64");
});

describe("credentials", () => {
  it("round-trips a credential blob", () => {
    expect(decryptCredentials(encryptCredentials(SECRET))).toEqual(SECRET);
  });

  it("does not leave the plaintext readable in the stored bytes", () => {
    const blob = encryptCredentials(SECRET);
    expect(Buffer.from(blob).toString("utf8")).not.toContain("s3cr3t-value");
  });

  it("uses a fresh nonce per write, so the same secret encrypts differently", () => {
    const a = Buffer.from(encryptCredentials(SECRET));
    const b = Buffer.from(encryptCredentials(SECRET));
    expect(a.equals(b)).toBe(false);
    // ...but both still decrypt to the same value.
    expect(decryptCredentials(a)).toEqual(decryptCredentials(b));
  });

  it("rejects tampered ciphertext rather than returning garbage", () => {
    const tampered = Uint8Array.from(encryptCredentials(SECRET));
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptCredentials(tampered)).toThrow();
  });

  it("rejects a blob too short to hold an iv and tag", () => {
    expect(() => decryptCredentials(new Uint8Array(8))).toThrow(/too short/i);
  });
});

/**
 * `credentials IS NULL` is the single representation of "this integration has
 * no auth". encodeAuthCredential and parseAuthCredential are inverses across
 * that boundary — if they ever drift, a no-auth integration either stores a
 * pointless blob or fails to sync.
 */
describe("auth credential encoding", () => {
  it("stores nothing for AuthType.None", () => {
    expect(encodeAuthCredential({ authType: AuthType.None })).toBeNull();
  });

  it("reads a null column back as AuthType.None", () => {
    expect(parseAuthCredential(null, "int-1")).toEqual({
      authType: AuthType.None,
    });
  });

  it("round-trips an authenticated credential through the column", () => {
    const stored = encodeAuthCredential(SECRET);
    expect(stored).not.toBeNull();
    expect(parseAuthCredential(decryptCredentials(stored!), "int-1")).toEqual(
      SECRET,
    );
  });

  it("rejects a stored blob that is not a credential shape", () => {
    expect(() => parseAuthCredential({ nonsense: true }, "int-1")).toThrow(
      /invalid credentials/i,
    );
  });
});
