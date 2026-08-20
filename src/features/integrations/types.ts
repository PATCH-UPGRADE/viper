import type { inferOutput } from "@trpc/tanstack-react-query";
import { z } from "zod";
import { INTEGRATION_SYNC_EVERY_MIN } from "@/config/constants";
import { PlatformEnum, ResourceType } from "@/generated/prisma";
import { authSchema } from "@/lib/schemas";
import type { trpc } from "@/trpc/server";

export const integrationsMapping = {
  assets: { name: "Asset", type: ResourceType.Asset },
  deviceArtifacts: {
    name: "Device Artifact",
    type: ResourceType.DeviceArtifact,
  },
  remediations: { name: "Remediation", type: ResourceType.Remediation },
  vulnerabilities: { name: "Vulnerability", type: ResourceType.Vulnerability },
  workOrders: { name: "Work Order", type: ResourceType.WorkOrder },
} as const satisfies Record<string, { name: string; type: ResourceType }>;

export type UploadSegment = keyof typeof integrationsMapping;

export const uploadSegmentFor = Object.fromEntries(
  Object.entries(integrationsMapping).map(([segment, { type }]) => [
    type,
    segment,
  ]),
) as Record<(typeof integrationsMapping)[UploadSegment]["type"], UploadSegment>;

/** Derived from the table, so the two can't drift. */
export const resourceTypeSchema = z.enum(
  Object.values(integrationsMapping).map((r) => r.type),
);

/**
 * `config` stays opaque here on purpose. Narrowing it per-platform would mean
 * importing every platform's `configSchema`, and those reach `core/credentials.ts`
 * (`node:crypto`, `server-only`) — which would make this module unusable from a
 * client component. The router narrows it instead, with the platform's own
 * schema, so the platform stays the single validator either way.
 */
export const integrationInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  platform: z.enum(PlatformEnum),
  syncEvery: z
    .number()
    .int()
    .positive()
    .min(INTEGRATION_SYNC_EVERY_MIN * 60),
  config: z.record(z.string(), z.unknown()),
  /** Omitted on edit means "keep what is stored" — see the router. */
  credentials: authSchema.optional(),
});
export type IntegrationFormValues = z.infer<typeof integrationInputSchema>;

export function isValidResourceTypeKey(key: string): key is UploadSegment {
  return key in integrationsMapping;
}

const resourceTypeLabels: Record<ResourceType, string> = {
  [ResourceType.Asset]: "Asset",
  [ResourceType.DeviceArtifact]: "Device Artifact",
  [ResourceType.Remediation]: "Remediation",
  [ResourceType.Vulnerability]: "Vulnerability",
  [ResourceType.WorkOrder]: "Work Order",
  [ResourceType.SourceRecord]: "Notification",
};
export const resourceTypeLabel = (type: ResourceType): string =>
  resourceTypeLabels[type] ?? type;

export type IntegrationListItem = inferOutput<
  typeof trpc.integrations.getMany
>["items"][number];
export type IntegrationResourceSyncItem =
  IntegrationListItem["resourceSyncs"][number];
