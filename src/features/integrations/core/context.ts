import "server-only";
import prisma from "@/lib/db";
import {
  decryptCredentials,
  parseAuthCredential,
  usesGenericAuth,
} from "./credentials";
import { requirePlatform } from "./registry";
import type { AnyConnectorModule } from "./types";

/**
 * A platform module with one integration's settings already parsed and its
 * credentials already decrypted.
 */
export interface IntegrationContext {
  module: AnyConnectorModule;
  config: unknown;
  creds: unknown;
}

/**
 * Everything needed to call a platform on behalf of one integration row.
 *
 * A sync gets this handed to it. A user-initiated call — reading or writing a
 * record on the platform while someone waits — has to ask for it, which is what
 * this is for. Both parse with the platform's own schemas, so the platform stays
 * the single validator either way.
 */
export const loadIntegrationContext = async (
  integrationId: string,
): Promise<IntegrationContext> => {
  const row = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { platform: true, config: true, credentials: true, enabled: true },
  });
  if (!row) throw new Error(`No integration ${integrationId}`);
  if (!row.enabled) {
    throw new Error(`Integration ${integrationId} is disabled`);
  }

  const module = requirePlatform(row.platform);
  const config = module.definition.configSchema.parse(row.config);

  const decrypted = row.credentials
    ? decryptCredentials(row.credentials)
    : null;
  const creds = module.definition.credentialSchema.parse(
    usesGenericAuth(module.definition.credentialSchema)
      ? parseAuthCredential(decrypted, integrationId)
      : (decrypted ?? {}),
  );

  return { module, config, creds };
};
