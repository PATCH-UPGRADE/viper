import { z } from "zod";
import { INTEGRATION_SYNC_EVERY_MIN } from "@/config/constants";
import {
  type Integration,
  PlatformEnum,
  ResourceType,
  SyncStatusEnum,
} from "@/generated/prisma";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import { authSchema, userSchema } from "@/lib/schemas";

/**
 * The resources a platform can sync, keyed by the URL segment they upload to.
 */
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
 * What `integrations.create` / `.update` accept.
 *
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

/** Human label for a resource type, e.g. for the enabled-integrations table. */
const resourceTypeLabels: Partial<Record<ResourceType, string>> =
  Object.fromEntries(
    Object.values(integrationsMapping).map((r) => [r.type, r.name]),
  );
export const resourceTypeLabel = (type: ResourceType): string =>
  resourceTypeLabels[type] ?? type;

/**
 * Human label for a platform, kept in sync with each module's own
 * `displayName` (see `platforms/{ai,partner}/index.ts`). Duplicated rather than
 * imported: those modules chain into `core/credentials.ts` (`node:crypto`,
 * `server-only`), which would make this client-safe file unusable from one.
 */
export const platformLabels: Record<PlatformEnum, string> = {
  [PlatformEnum.AI]: "AI Crawler",
  [PlatformEnum.PARTNER]: "Partner API",
  [PlatformEnum.FLEET]: "Fleet",
};

/**
 * A row's resource sync, as returned by `integrations.getMany`. Declared as
 * an explicit `.output()` schema on that procedure (rather than left to
 * `inferOutput`) because it's built by `fetchPaginated`, whose generic
 * `findMany` call doesn't carry a concrete result type through to the client.
 */
export const integrationResourceSyncItemSchema = z.object({
  integrationId: z.string(),
  resource: z.enum(ResourceType),
  status: z.enum(SyncStatusEnum),
  errorMessage: z.string().nullable(),
  lastAttemptAt: z.date().nullable(),
  lastSuccessfulSync: z.date().nullable(),
  nextSyncAt: z.date().nullable(),
  enabled: z.boolean(),
  /** The resource's own override, or null to inherit. */
  syncEvery: z.number().nullable(),
  isOverridden: z.boolean(),
  effectiveSyncEvery: z.number(),
});
export type IntegrationResourceSyncItem = z.infer<
  typeof integrationResourceSyncItemSchema
>;

export const integrationListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: z.enum(PlatformEnum),
  config: z.unknown(),
  syncEvery: z.number().nullable(),
  enabled: z.boolean(),
  userId: z.string(),
  integrationUserId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
  resourceSyncs: z.array(integrationResourceSyncItemSchema),
});
export type IntegrationListItem = z.infer<typeof integrationListItemSchema>;

export const paginatedIntegrationsResponseSchema =
  createPaginatedResponseSchema(integrationListItemSchema);

export type IntegrationWithStringDates = Omit<
  Integration,
  "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};
