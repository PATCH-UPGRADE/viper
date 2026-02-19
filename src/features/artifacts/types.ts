import { z } from "zod";
import { ArtifactType } from "@/generated/prisma";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import { safeUrlSchema } from "@/lib/schemas";

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
        hash: true,
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

export const artifactInputSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    artifactType: z.enum(ArtifactType),
    downloadUrl: safeUrlSchema.optional(),
    hash: z.string().optional(),
    size: z.number().optional(),
  })
  .refine((data) => data.downloadUrl !== undefined || data.hash !== undefined, {
    message: "Either downloadUrl or hash must be provided",
  });

export const artifactWithUrlsSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  artifactType: z.enum(ArtifactType),
  downloadUrl: z.string().nullable(),
  hash: z.string().nullable(),
  size: z.number().nullable(),
  versionNumber: z.number(), // maps to versionNumber
  createdAt: z.date(),
  updatedAt: z.date(),
  url: z.string(),
  prevVersionId: z.string().nullable(),
});
export type ArtifactWithUrls = z.infer<typeof artifactWithUrlsSchema>;

export const artifactWrapperWithUrlsSchema = z.object({
  id: z.string(),
  versionsCount: z.int(),
  allVersionsUrl: z.string(),
  latestArtifact: artifactWithUrlsSchema,
});
export type ArtifactWrapperWithUrls = z.infer<
  typeof artifactWrapperWithUrlsSchema
>;

export const artifactUpdateSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  artifactType: z.enum(ArtifactType).optional(),
  size: z.number().optional(),
});

export const createArtifactVersionSchema = artifactInputSchema.extend({
  wrapperId: z.string(),
});

export const paginatedArtifactResponseSchema = createPaginatedResponseSchema(
  artifactWithUrlsSchema,
);
