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
import { deviceGroupSchema, deviceGroupSelect } from "../device-groups/types";

// Validation schemas
export const remediationInputSchema = z.object({
  cpes: z.array(cpeSchema).min(1),
  vulnerabilityId: z.string().optional(),
  description: z.string().optional(),
  narrative: z.string().optional(),
  upstreamApi: safeUrlSchema.optional(),
  artifacts: z
    .array(artifactInputSchema)
    .min(1, "at least one artifact is required"),
});

export const integrationRemediationInputSchema = createIntegrationInputSchema(
  remediationInputSchema,
);

export const remediationUpdateSchema = z.object({
  id: z.string(),
  cpes: z.array(cpeSchema).optional(),
  vulnerabilityId: z.string().optional(),
  description: z.string().optional(),
  narrative: z.string().optional(),
  upstreamApi: safeUrlSchema.optional(),
  artifacts: z.array(artifactInputSchema).optional(),
});

export const vulnerabilitySchema = z.object({
  id: z.string(),
  url: z.string(),
});

export const remediationResponseSchema = z.object({
  id: z.string(),
  affectedDeviceGroups: z.array(deviceGroupSchema),
  upstreamApi: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  narrative: z.string().optional().nullable(),
  vulnerability: vulnerabilitySchema.optional().nullable(),
  user: userSchema,
  artifacts: z.array(artifactWrapperWithUrlsSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type RemediationResponse = z.infer<typeof remediationResponseSchema>;

export const paginatedRemediationResponseSchema = createPaginatedResponseSchema(
  remediationResponseSchema,
);

const uploadInstructionsSchema = z.object({
  artifactName: z.string(),
  uploadUrl: z.string().url(),
  requiredHeader: z.string(),
});

export const remediationUploadResponseSchema = z.object({
  remediation: remediationResponseSchema,
  uploadInstructions: z.array(uploadInstructionsSchema),
});

const remediationVulnerabilitySelect = {
  select: {
    id: true,
    url: true,
  },
} as const;

export const remediationInclude = {
  user: userIncludeSelect,
  vulnerability: remediationVulnerabilitySelect,
  affectedDeviceGroups: deviceGroupSelect,
  artifacts: artifactWrapperSelect,
};
