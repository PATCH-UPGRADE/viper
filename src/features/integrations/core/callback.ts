import "server-only";
import { z } from "zod";
import { integrationAssetInputSchema } from "@/features/assets/types";
import { integrationDeviceArtifactInputSchema } from "@/features/device-artifacts/types";
import { integrationRemediationInputSchema } from "@/features/remediations/types";
import { integrationWorkOrderInputSchema } from "@/features/tracking/types";
import { integrationVulnerabilityInputSchema } from "@/features/vulnerabilities/types";
import { ResourceType } from "@/generated/prisma";
import { createUserToken, DEFAULT_TOKEN_TTL_SECONDS } from "@/lib/tokens";
import { getBaseUrl } from "@/lib/url-utils";
import { uploadSegmentFor } from "../types";
import type { CallbackConfig } from "./types";

/**
 * Where should ai and partner integrations
 * * return their responses to
 * * what schema should they use in that response
 * And create a callback token for this endpoint
 */

/**
 * The envelope schema per resource. The URL segment that goes with each one
 * lives in `integrationsMapping` — a client-safe table, because the connectors
 * UI reads it too. These schemas can't join it there: they reach `@/lib/tokens`
 * and would drag the server into a client bundle.
 */
const ENVELOPE_SCHEMAS = {
  [ResourceType.Asset]: integrationAssetInputSchema,
  [ResourceType.DeviceArtifact]: integrationDeviceArtifactInputSchema,
  [ResourceType.Remediation]: integrationRemediationInputSchema,
  [ResourceType.Vulnerability]: integrationVulnerabilityInputSchema,
  [ResourceType.WorkOrder]: integrationWorkOrderInputSchema,
} as const satisfies Partial<Record<ResourceType, z.ZodType>>;

/**
 * Mint a one-time, resource-scoped token for the integration's shadow user and
 * describe where — and in what shape — a platform pushes data back.
 */
export const createCallback = async (
  integrationUserId: string,
  resource: ResourceType,
): Promise<CallbackConfig> => {
  const schema = ENVELOPE_SCHEMAS[resource as keyof typeof ENVELOPE_SCHEMAS];
  const segment = uploadSegmentFor[resource as keyof typeof uploadSegmentFor];
  if (!schema || !segment) {
    throw new Error(`Unhandled ResourceType: ${resource}`);
  }

  const raw = await createUserToken(
    integrationUserId,
    DEFAULT_TOKEN_TTL_SECONDS,
    resource,
  );

  // If you're testing this locally and need webhooks, use NEXT_PUBLIC_APP_URL
  const baseApiUrl = `${getBaseUrl()}/api/v1`;
  const path = `/${segment}/integrationUpload/${raw}`;

  return {
    baseApiUrl,
    path,
    url: `${baseApiUrl}${path}`,
    schema: z.toJSONSchema(schema) as Record<string, unknown>,
  };
};
