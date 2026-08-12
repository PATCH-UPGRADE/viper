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
import type { CallbackConfig } from "./types";

/**
 * Where should ai and partner integrations
 * * return their responses to
 * * what schema should they use in that response
 * And create a callback token for this endpoint
 */

/**
 * Upload endpoint + envelope schema per resource
 */
const ENDPOINTS = {
  [ResourceType.Asset]: {
    segment: "assets",
    schema: integrationAssetInputSchema,
  },
  [ResourceType.DeviceArtifact]: {
    segment: "deviceArtifacts",
    schema: integrationDeviceArtifactInputSchema,
  },
  [ResourceType.Remediation]: {
    segment: "remediations",
    schema: integrationRemediationInputSchema,
  },
  [ResourceType.Vulnerability]: {
    segment: "vulnerabilities",
    schema: integrationVulnerabilityInputSchema,
  },
  [ResourceType.WorkOrder]: {
    segment: "workOrders",
    schema: integrationWorkOrderInputSchema,
  },
} as const satisfies Partial<
  Record<ResourceType, { segment: string; schema: z.ZodType }>
>;

/**
 * Mint a one-time, resource-scoped token for the integration's shadow user and
 * describe where — and in what shape — a platform pushes data back.
 */
export const createCallback = async (
  integrationUserId: string,
  resource: ResourceType,
): Promise<CallbackConfig> => {
  const endpoint = ENDPOINTS[resource as keyof typeof ENDPOINTS];
  if (!endpoint) {
    throw new Error(`Unhandled ResourceType: ${resource}`);
  }

  const raw = await createUserToken(
    integrationUserId,
    DEFAULT_TOKEN_TTL_SECONDS,
    resource,
  );

  // If you're testing this locally and need webhooks, use NEXT_PUBLIC_APP_URL
  const baseApiUrl = `${getBaseUrl()}/api/v1`;
  const path = `/${endpoint.segment}/integrationUpload/${raw}`;

  return {
    baseApiUrl,
    path,
    url: `${baseApiUrl}${path}`,
    schema: z.toJSONSchema(endpoint.schema) as Record<string, unknown>,
  };
};
