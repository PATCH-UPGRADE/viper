import type { inferOutput } from "@trpc/tanstack-react-query";
import { z } from "zod";
import { INTEGRATION_SYNC_EVERY_MIN } from "@/config/constants";
import { PlatformEnum, ResourceType } from "@/generated/prisma";
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

/** The connectors dashboard's sections. A platform can belong to more than one. */
export const CATEGORIES = [
  "Hospital Inventory",
  "Vulnerability Management Platforms",
  "Ticketing Platforms",
  "Notifications",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** ResourceType -> the URL segment it uploads to. Inverse of the table above. */
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
  /**
   * Opaque for the same reason `config` is — not every platform uses `authSchema`.
   * Omitted on edit means "keep what is stored" — see the router.
   */
  credentials: z.record(z.string(), z.unknown()).optional(),
});
export type IntegrationFormValues = z.infer<typeof integrationInputSchema>;

export function isValidResourceTypeKey(key: string): key is UploadSegment {
  return key in integrationsMapping;
}

/** Derived from the table (plus SourceRecord, which has no UploadSegment), so the two can't drift. */
const resourceTypeLabels: Record<ResourceType, string> = {
  ...(Object.fromEntries(
    Object.values(integrationsMapping).map((r) => [r.type, r.name]),
  ) as Record<(typeof integrationsMapping)[UploadSegment]["type"], string>),
  [ResourceType.SourceRecord]: "Notification",
};
export const resourceTypeLabel = (type: ResourceType): string =>
  resourceTypeLabels[type];

export type IntegrationListItem = inferOutput<
  typeof trpc.integrations.getMany
>["items"][number];
export type IntegrationResourceSyncItem =
  IntegrationListItem["resourceSyncs"][number];

/** A config/credentialSchema field, reduced to plain data to cross the Server->Client boundary. */
export interface FieldSpec {
  key: string;
  kind: "text" | "password" | "url" | "number" | "select";
  required: boolean;
  options?: string[];
}
