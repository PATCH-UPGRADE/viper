import "server-only";
import { AuthType } from "@/generated/prisma";
import { parseAuthenticationJson } from "@/lib/utils";
import type { AuthCredential } from "../credentials";
import type { Session } from "../types";
import { createHttpSession } from "./http";

/** Static header auth: basic, bearer, or an arbitrary header. */
export const authHeaders = (creds: AuthCredential): Record<string, string> => {
  if (creds.authType === AuthType.None) return {};
  const { header, value } = parseAuthenticationJson(creds);
  return { [header]: value };
};

export const createBasicSession = (input: {
  baseUrl: string;
  creds: AuthCredential;
}): Session =>
  createHttpSession({
    baseUrl: input.baseUrl,
    headers: authHeaders(input.creds),
  });

/**
 * For platforms that never fetch: they hand off, and the data comes back
 * through the callback endpoint. Throwing rather than no-oping means a strategy
 * that reaches for a session it shouldn't have gets a clear message instead of
 * a confusing `undefined`.
 */
export const createNoopSession = (): Session => ({
  async request(): Promise<never> {
    throw new Error(
      "This platform does not fetch from the upstream: it hands off, and data returns via the callback endpoint.",
    );
  },
});
