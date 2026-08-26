import type { inferOutput } from "@trpc/tanstack-react-query";
import { z } from "zod";
import { AssetStatus, PlatformEnum, type Prisma } from "@/generated/prisma";
import type { ExtendedPrismaClient } from "@/lib/db";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import {
  cpeSchema,
  createIntegrationInputSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import type { trpc } from "@/trpc/server";
import {
  deviceGroupSelect,
  deviceGroupWithUrlsSchema,
} from "../device-groups/types";
import { scopedNoteSchema } from "../notes/schemas";
import { remediationCardInclude } from "../remediations/types";

const assetStatusSchema = z.enum(Object.values(AssetStatus));

export const locationSchema = z.object({
  facility: z.string().optional(),
  building: z.string().optional(),
  floor: z.string().optional(),
  room: z.string().optional(),
});

const utilizationHourKeySchema = z.string().regex(/^(?:[0-9]|1[0-9]|2[0-3])$/);

// TODO: add more rigorous type to z.number().int() after collabing with VL
export const assetUtilizationSchema = z.array(
  z.record(utilizationHourKeySchema, z.number().int()),
);

export const assetInputSchema = z.object({
  ip: z.string().min(1),
  networkSegment: z.string().nullish(),
  cpe: cpeSchema.nullish(),
  role: z.string().min(1).nullish(),
  hostname: z.string().nullish(),
  macAddress: z.string().nullish(),
  serialNumber: z.string().nullish(),
  location: locationSchema.optional(),
  status: assetStatusSchema.nullish(),
  utilization: assetUtilizationSchema.nullish(),
  version: z.string().trim().min(1).max(64).optional(),
  versionStatus: z.enum(["UNKNOWN", "UNSURE"]).optional(),
});

export const updateAssetSchema = assetInputSchema.partial().extend({
  id: z.string(),
});

// NOTE: tRPC / OpenAPI doesn't allow for arrays as the INPUT schema
// if you try it will default to a single asset schema
// to get around that wrap the array of assets in an object
export const assetArrayInputSchema = z.object({
  assets: z.array(assetInputSchema).nonempty(),
});

export const assetResponseSchema = z.object({
  id: z.string(),
  ip: z.string().nullable(),
  deviceGroup: deviceGroupWithUrlsSchema,
  role: z.string().nullable(),
  externalMappings: z.array(
    z.object({
      externalId: z.string(),
      upstreamApi: z.string().nullable(),
      webUrl: z.string().nullable(),
      integration: z.object({
        id: z.string(),
        name: z.string(),
        platform: z.enum(PlatformEnum),
      }),
    }),
  ),
  networkSegment: z.string().nullable(),
  hostname: z.string().nullable(),
  macAddress: z.string().nullable(),
  serialNumber: z.string().nullable(),
  location: z.unknown().nullable(),
  status: assetStatusSchema.nullable(),
  utilization: z.unknown().nullable(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
  notes: z.array(scopedNoteSchema).optional(),
});
export type AssetResponse = z.infer<typeof assetResponseSchema>;

export const assetArrayResponseSchema = z.array(assetResponseSchema);

export const paginatedAssetResponseSchema =
  createPaginatedResponseSchema(assetResponseSchema);

export const integrationAssetInputSchema =
  createIntegrationInputSchema(assetInputSchema);

export const assetsVulnsInputSchema = z.object({
  assetIds: z.array(z.string()).optional(),
  deviceGroupMatchingIds: z.array(z.string()).optional(),
});
export type AssetsVulnsInput = z.infer<typeof assetsVulnsInputSchema>;

export const assetInclude = {
  user: userIncludeSelect,
  deviceGroup: deviceGroupSelect,
  externalMappings: {
    select: {
      externalId: true,
      upstreamApi: true,
      webUrl: true,
      integration: { select: { id: true, name: true, platform: true } },
    },
  },
} satisfies Prisma.AssetInclude;

/**
 * Derived from the *extended* client, not `Prisma.AssetGetPayload` — the device
 * group's `url` / `sbomUrl` / ... are computed by `deviceGroupExtension`, and
 * the base payload helper resolves them to `never`.
 */
export type AssetWithRelations = Prisma.Result<
  ExtendedPrismaClient["asset"],
  { include: typeof assetInclude },
  "findUniqueOrThrow"
>;

export const assetDashboardInclude = {
  user: userIncludeSelect,
  deviceGroup: deviceGroupSelect,
  externalMappings: {
    select: {
      id: true,
      externalId: true,
      lastSynced: true,
      upstreamApi: true,
      webUrl: true,
      integration: { select: { id: true, name: true, platform: true } },
    },
  },
  issues: {
    include: {
      vulnerability: {
        select: {
          id: true,
          severity: true,
          cveId: true,
          description: true,
          _count: { select: { remediations: true } },
          remediations: {
            include: remediationCardInclude,
          },
        },
      },
    },
  },
} satisfies Prisma.AssetInclude;

export type AssetWithIssueRelations = Prisma.AssetGetPayload<{
  include: typeof assetDashboardInclude;
}>;

export type AssetIssueMetricsCounts = inferOutput<
  typeof trpc.assets.getIssueMetricsInternal
>;
