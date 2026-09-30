import { assetInputSchema } from "@/features/assets/types";
import { deviceArtifactInputSchema } from "@/features/device-artifacts/types";
import { remediationInputSchema } from "@/features/remediations/types";
import { vulnerabilityInputSchema } from "@/features/vulnerabilities/types";
import { ResourceType } from "@/generated/prisma";
import { createIntegrationItemSchema } from "@/lib/schemas";

/**
 * What the crawler records for each resource. Fields that hold VIPER ids are
 * left out: the model only sees the upstream API, so any id it gave there
 * would be invented and fail the connect.
 */
export const CRAWLER_ITEM_SCHEMAS = {
  [ResourceType.Asset]: createIntegrationItemSchema(assetInputSchema),
  [ResourceType.Vulnerability]: createIntegrationItemSchema(
    vulnerabilityInputSchema.omit({ deviceArtifactId: true }).extend({
      // Zod 4 makes a bare z.any() key required, so the model would have to
      // invent a SARIF value for every vulnerability. The ingest fills {}.
      sarif: vulnerabilityInputSchema.shape.sarif.optional(),
    }),
  ),
  [ResourceType.Remediation]: createIntegrationItemSchema(
    remediationInputSchema.omit({
      vulnerabilityIds: true,
      vulnerabilityId: true,
    }),
  ),
  [ResourceType.DeviceArtifact]: createIntegrationItemSchema(
    deviceArtifactInputSchema,
  ),
};

export type CrawlerResource = keyof typeof CRAWLER_ITEM_SCHEMAS;

export const isCrawlerResource = (
  resource: ResourceType,
): resource is CrawlerResource => resource in CRAWLER_ITEM_SCHEMAS;
