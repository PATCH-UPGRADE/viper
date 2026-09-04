import "server-only";
import { decryptCredentials } from "@/features/integrations/core/credentials";
import type { Prisma } from "@/generated/prisma";
import { configSchema, credentialSchema, type FleetConfig } from "../config";
import { createFleetSession } from "../session";
import { create, type FleetWorkOrderDraft } from "./tickets";

/** The parts of an Integration row a push needs. */
export interface FleetIntegrationRow {
  config: Prisma.JsonValue;
  credentials: Uint8Array | null;
}

/**
 * Open one Fleet session and file as many work orders through it as the caller
 * needs. Signing in drives a headless browser, so a proposal covering several
 * assets must not repeat it once per asset.
 *
 * The pull path receives its session and settings from the sync context. A push
 * starts from a user action instead, so the caller supplies the row and this is
 * where the credentials are decrypted and the settings are parsed.
 */
export async function openFleetWorkOrderFiler(
  integration: FleetIntegrationRow,
): Promise<{
  config: FleetConfig;
  file(
    draft: FleetWorkOrderDraft,
  ): Promise<{ externalId: string; raw: unknown }>;
}> {
  if (!integration.credentials) {
    throw new Error(
      "The teamplay Fleet integration has no stored credentials — cannot sign in to file a work order.",
    );
  }

  const config = configSchema.parse(integration.config);
  const creds = credentialSchema.parse(
    decryptCredentials(integration.credentials),
  );

  const session = await createFleetSession(creds);

  return {
    config,
    file: (draft) => create(session, draft, config),
  };
}
