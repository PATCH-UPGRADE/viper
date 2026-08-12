import type { inferOutput } from "@trpc/tanstack-react-query";
import { z } from "zod";
import { INTEGRATION_SYNC_EVERY_MIN } from "@/config/constants";
import {
  type Integration,
  PlatformEnum,
  ResourceType,
} from "@/generated/prisma";
import { authSchema, safeUrlSchema } from "@/lib/schemas";
import type { trpc } from "@/trpc/server";

/**
 * Deliberately a hand-written list rather than `z.enum(ResourceType)`.
 * `ResourceType` also carries `SourceRecord`, which drives an
 * `IntegrationResourceSync` row but has no upload endpoint and must never be
 * offered in the integrations UI.
 */
export const resourceTypeSchema = z.enum([
  "Asset",
  "Vulnerability",
  "DeviceArtifact",
  "Remediation",
  "WorkOrder",
]);

/**
 * What the create/edit form binds to — deliberately flat, even though the row
 * stores `config` (JSON) and `credentials` (encrypted bytes). The tRPC router,
 * not the form, does the flat -> {config, credentials} transform.
 */
export const integrationInputSchema = authSchema.safeExtend({
  name: z.string().min(1, "Name is required"),
  platform: z.enum(PlatformEnum),
  integrationUri: safeUrlSchema,
  // Generic platforms (AI, PARTNER) are single-resource: the resource is part
  // of their config. FLEET ignores this until its module lands.
  resource: resourceTypeSchema,
  additionalInstructions: z.string().optional(), // was `Integration.prompt`
  syncEvery: z
    .number()
    .int()
    .positive()
    .min(INTEGRATION_SYNC_EVERY_MIN * 60),
});
export type IntegrationFormValues = z.infer<typeof integrationInputSchema>;

export function isValidResourceTypeKey(
  key: string,
): key is keyof typeof integrationsMapping {
  return key in integrationsMapping;
}

export const integrationsMapping = {
  assets: {
    name: "Asset",
    type: ResourceType.Asset,
  },
  deviceArtifacts: {
    name: "Device Artifact",
    type: ResourceType.DeviceArtifact,
  },
  remediations: {
    name: "Remediation",
    type: ResourceType.Remediation,
  },
  vulnerabilities: {
    name: "Vulnerability",
    type: ResourceType.Vulnerability,
  },
  workOrders: {
    name: "Work Order",
    type: ResourceType.WorkOrder,
  },
};

export type IntegrationWithRelations = inferOutput<
  typeof trpc.integrations.update
>;

export type IntegrationWithStringDates = Omit<
  Integration,
  "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};
