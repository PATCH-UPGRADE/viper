import "server-only";
import { decryptCredentials } from "@/features/integrations/core/credentials";
import type { WorkOrderFiler } from "@/features/integrations/core/types";
import type { Prisma } from "@/generated/prisma";
import {
  configSchema,
  credentialSchema,
  type FleetConfig,
  type FleetCreds,
} from "../config";
import { createFleetSession } from "../session";
import { create, type FleetWorkOrderDraft } from "./tickets";

/**
 * Sign in once and file every order of one submission through that session.
 * Signing in drives a headless browser, so a proposal covering several assets
 * must not repeat it once per asset.
 */
export async function openFiler(input: {
  config: FleetConfig;
  creds: FleetCreds;
}): Promise<WorkOrderFiler<FleetWorkOrderDraft>> {
  const session = await createFleetSession(input.creds);
  return { file: (draft) => create(session, draft, input.config) };
}

/** The parts of an Integration row a push needs. */
export interface FleetIntegrationRow {
  config: Prisma.JsonValue;
  credentials: Uint8Array | null;
}

/**
 * The same, for a caller that holds an Integration row rather than parsed
 * settings. This is where the credentials are decrypted and the config parsed.
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

  const filer = await openFiler({ config, creds });

  return { config, file: filer.file };
}
