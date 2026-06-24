import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import {
  alohaResponseSchema,
  cpeSchema,
  createIntegrationInputSchema,
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

// Validation schemas
export const remediationInputSchema = z.object({
  // TA3/TA4 upload affected devices as CPE strings; resolved to matchings server-side.
  cpes: z.array(cpeSchema).optional(),
  vulnerabilityId: z.string().nullish(),
  description: z.string().nullish(),
  narrative: z.string().nullish(),
  upstreamApi: safeUrlSchema.nullish(),
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
  vulnerabilityId: z.string().nullish(),
  description: z.string().nullish(),
  narrative: z.string().nullish(),
  upstreamApi: safeUrlSchema.nullish(),
  artifacts: z.array(artifactInputSchema).optional(),
});

export const vulnerabilitySchema = z.object({
  id: z.string(),
  url: z.string(),
});

export const remediationResponseSchema = z.object({
  id: z.string(),
  deviceGroupMatchings: z.array(deviceGroupMatchingResponseSchema),
  upstreamApi: z.string().nullish(),
  description: z.string().nullish(),
  narrative: z.string().nullish(),
  vulnerability: vulnerabilitySchema.nullish(),
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
  deviceGroupMatchings: matchingInclude,
  vulnerability: remediationVulnerabilitySelect,
  artifacts: artifactWrapperSelect,
};

export const remediationCardInclude = {
  user: userIncludeSelect,
  artifacts: artifactWrapperSelect,
} as const;

export type RemediationCard = Prisma.RemediationGetPayload<{
  include: typeof remediationCardInclude;
}>;

export const remediationAlohaResponseSchema = z.object({
  remediation: remediationResponseSchema,
  aloha: alohaResponseSchema,
});
