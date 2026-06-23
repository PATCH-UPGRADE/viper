import { z } from "zod";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import {
  cpeSchema,
  createIntegrationInputSchema,
  deviceGroupMatchingInputSchema,
  deviceGroupMatchingResponseSchema,
  safeUrlSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import {
  artifactInputSchema,
  artifactWrapperSelect,
  artifactWrapperWithUrlsSchema,
} from "../artifacts/types";

const canonicalRefInclude = {
  select: { canonicalName: true, canonicalDisplayName: true },
} as const;

const matchingInclude = {
  include: {
    vendor: canonicalRefInclude,
    product: canonicalRefInclude,
    version: canonicalRefInclude,
  },
} as const;

export const deviceArtifactInputSchema = z.object({
  // The device this artifact is for (resolved to an identity matching).
  cpe: cpeSchema,
  // Optional SBOM components this artifact contains (auto-parsing deferred).
  componentMatchings: z.array(deviceGroupMatchingInputSchema).optional(),
  role: z.string().min(1, "Role is required"),
  description: z.string().min(1, "Description is required"),
  upstreamApi: safeUrlSchema.nullish(),
  artifacts: z
    .array(artifactInputSchema)
    .min(1, "at least one artifact is required"),
});

export const integrationDeviceArtifactInputSchema =
  createIntegrationInputSchema(deviceArtifactInputSchema);

export const deviceArtifactUpdateSchema = z.object({
  id: z.string(),
  role: z.string().min(1, "Role is required").optional(),
  description: z.string().optional(),
  upstreamApi: safeUrlSchema.optional(),
  cpe: cpeSchema.optional(),
  componentMatchings: z.array(deviceGroupMatchingInputSchema).optional(),
});

export const deviceArtifactResponseSchema = z.object({
  id: z.string(),
  role: z.string(),
  upstreamApi: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
  deviceGroupMatchings: z.array(deviceGroupMatchingResponseSchema),
  artifacts: z.array(artifactWrapperWithUrlsSchema),
});
export type DeviceArtifactResponse = z.infer<
  typeof deviceArtifactResponseSchema
>;

const uploadInstructionsSchema = z.object({
  artifactName: z.string(),
  uploadUrl: z.string().url(),
  requiredHeader: z.string(),
});

export const deviceArtifactUploadResponseSchema = z.object({
  deviceArtifact: deviceArtifactResponseSchema,
  uploadInstructions: z.array(uploadInstructionsSchema),
});

export const paginatedDeviceArtifactResponseSchema =
  createPaginatedResponseSchema(deviceArtifactResponseSchema);

export const deviceArtifactInclude = {
  user: userIncludeSelect,
  deviceGroupMatchings: matchingInclude,
  artifacts: artifactWrapperSelect,
};
