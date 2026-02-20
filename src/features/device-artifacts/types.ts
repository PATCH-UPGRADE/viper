import { z } from "zod";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import {
  cpeSchema,
  createIntegrationInputSchema,
  safeUrlSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import {
  artifactInputSchema,
  artifactWrapperSelect,
  artifactWrapperWithUrlsSchema,
} from "../artifacts/types";
import {
  deviceGroupSelect,
  deviceGroupWithUrlsSchema,
} from "../device-groups/types";

export const deviceArtifactInputSchema = z.object({
  cpe: cpeSchema,
  role: z.string().min(1, "Role is required"),
  description: z.string().min(1, "Description is required"),
  upstreamApi: safeUrlSchema.optional(),
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
});

export const deviceArtifactResponseSchema = z.object({
  id: z.string(),
  role: z.string(),
  upstreamApi: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
  deviceGroup: deviceGroupWithUrlsSchema,
  artifacts: z.array(artifactWrapperWithUrlsSchema),
});
export type DeviceArtifactResponse = z.infer<
  typeof deviceArtifactResponseSchema
>;

export const paginatedDeviceArtifactResponseSchema =
  createPaginatedResponseSchema(deviceArtifactResponseSchema);

export const deviceArtifactInclude = {
  user: userIncludeSelect,
  deviceGroup: deviceGroupSelect,
  artifacts: artifactWrapperSelect,
};
