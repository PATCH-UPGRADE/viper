import { z } from "zod";
import { ArtifactType } from "@/generated/prisma";
import { createPaginatedResponseWithLinksSchema } from "./pagination";

/**
 * Shared Zod schema for User responses
 * Matches Prisma User model (name and email are required, image is nullable)
 */
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  image: z.string().nullable(),
});
export type UserIncludeType = z.infer<typeof userSchema>;

/**
 * Reusable URL validator to prevent javascript: and other dangerous protocols
 * Only allows http, https, and git protocols
 */
export const safeUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => {
      try {
        const protocol = new URL(url).protocol;
        return (
          protocol === "http:" || protocol === "https:" || protocol === "git:"
        );
      } catch {
        return false;
      }
    },
    { message: "Only http(s) and git URLs allowed" },
  );

/**
 * CPE 2.3 format validator
 * Validates Common Platform Enumeration strings
 */
export const cpeSchema = z
  .string()
  .regex(/^cpe:2\.3:[^:]+:[^:]+:[^:]+/, "Invalid CPE 2.3 format");

/**
 * Shared user include/select pattern for Prisma queries
 * Use this consistently across all routers when including user relations
 */
export const userIncludeSelect = {
  select: {
    id: true,
    name: true,
    email: true,
    image: true,
  },
} as const;

export const deviceGroupSchema = z.object({
  id: z.string(),
  cpe: z.string(),
});
export type DeviceGroupIncludeType = z.infer<typeof deviceGroupSchema>;
export const deviceGroupWithUrlsSchema = deviceGroupSchema.extend({
  url: z.string(),
  sbomUrl: z.string().nullable(), // TODO: VW-54
  vulnerabilitiesUrl: z.string(),
  deviceArtifactsUrl: z.string(),
  assetsUrl: z.string(),
});
export type DeviceGroupWithUrls = z.infer<typeof deviceGroupWithUrlsSchema>;
export const deviceGroupWithDetailsSchema = deviceGroupWithUrlsSchema.extend({
  manufacturer: z.string().nullable(),
  modelName: z.string().nullable(),
  version: z.string().nullable(),
  helmSbomId: z.string().nullable(),
});
export type DeviceGroupWithDetails = z.infer<
  typeof deviceGroupWithDetailsSchema
>;

export const deviceGroupSelect = {
  select: {
    id: true,
    cpe: true,
    url: true,
    sbomUrl: true,
    vulnerabilitiesUrl: true,
    assetsUrl: true,
    deviceArtifactsUrl: true,
  },
} as const;

export const artifactWrapperSelect = {
  select: {
    id: true,
    allVersionsUrl: true,
    latestArtifact: {
      select: {
        id: true,
        name: true,
        artifactType: true,
        downloadUrl: true,
        size: true,
        versionNumber: true,
        createdAt: true,
        updatedAt: true,
        url: true,
        prevVersionId: true,
      },
    },
    _count: {
      select: {
        artifacts: true,
      },
    },
  },
} as const;

export const artifactInputSchema = z.object({
  name: z.string().optional(),
  artifactType: z.enum(ArtifactType),
  downloadUrl: safeUrlSchema,
  // ^TODO: currently required, although we want to add file uploads. see VW-61
  size: z.number().optional(),
});

export const artifactWithUrlsSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  artifactType: z.enum(ArtifactType),
  downloadUrl: z.string().nullable(),
  size: z.number().nullable(),
  versionNumber: z.number(), // maps to versionNumber
  createdAt: z.date(),
  updatedAt: z.date(),
  url: z.string(),
  prevVersionId: z.string().nullable(),
});

export const artifactWrapperWithUrlsSchema = z.object({
  id: z.string(),
  versionsCount: z.int(),
  allVersionsUrl: z.string(),
  latestArtifact: artifactWithUrlsSchema,
});
export type ArtifactWrapperWithUrls = z.infer<
  typeof artifactWrapperWithUrlsSchema
>;

export const integrationResponseSchema = z.object({
  message: z.string(),
  createdItemsCount: z.number(),
  updatedItemsCount: z.number(),
  shouldRetry: z.boolean(),
  syncedAt: z.string(),
});
export type IntegrationResponse = z.infer<typeof integrationResponseSchema>;
export const createIntegrationInputSchema = <T extends z.ZodRawShape>(
  inputSchema: z.ZodObject<T>,
) => {
  const integrationInputSchema = inputSchema.extend({
    vendorId: z.string(),
  });
  return createPaginatedResponseWithLinksSchema(integrationInputSchema);
};
