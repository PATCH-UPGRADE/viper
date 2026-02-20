import { z } from "zod";
import { AssetStatus } from "@/generated/prisma";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import {
  cpeSchema,
  createIntegrationInputSchema,
  safeUrlSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import {
  deviceGroupSelect,
  deviceGroupWithUrlsSchema,
} from "../device-groups/types";

const assetStatusSchema = z.enum(Object.values(AssetStatus));

export const locationSchema = z.object({
  facility: z.string().optional(),
  building: z.string().optional(),
  floor: z.string().optional(),
  room: z.string().optional(),
});

export const assetInputSchema = z.object({
  ip: z.string().min(1),
  networkSegment: z.string().optional(),
  cpe: cpeSchema,
  role: z.string().min(1),
  upstreamApi: safeUrlSchema,
  hostname: z.string().optional(),
  macAddress: z.string().optional(),
  serialNumber: z.string().optional(),
  location: locationSchema.optional(),
  status: assetStatusSchema.optional(),
});

export const updateAssetSchema = assetInputSchema.extend({
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
  ip: z.string(),
  deviceGroup: deviceGroupWithUrlsSchema,
  role: z.string(),
  upstreamApi: z.string(),
  networkSegment: z.string().nullable(),
  hostname: z.string().nullable(),
  macAddress: z.string().nullable(),
  serialNumber: z.string().nullable(),
  location: z.unknown().nullable(),
  status: assetStatusSchema.nullable(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
});
export type AssetResponse = z.infer<typeof assetResponseSchema>;

export const assetArrayResponseSchema = z.array(assetResponseSchema);

export const paginatedAssetResponseSchema =
  createPaginatedResponseSchema(assetResponseSchema);

export const integrationAssetInputSchema =
  createIntegrationInputSchema(assetInputSchema);

export const assetsVulnsInputSchema = z.object({
  assetIds: z.array(z.string()).optional(),
  cpes: z.array(cpeSchema).optional(),
});
export type AssetsVulnsInput = z.infer<typeof assetsVulnsInputSchema>;

export const assetInclude = {
  user: userIncludeSelect,
  deviceGroup: deviceGroupSelect,
};
