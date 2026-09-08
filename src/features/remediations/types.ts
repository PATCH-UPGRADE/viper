import { z } from "zod";
import { externalMappingSelect } from "@/features/integrations/core/urls";
import { PlatformEnum, type Prisma } from "@/generated/prisma";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import {
  alohaResponseSchema,
  cpeSchema,
  createIntegrationInputSchema,
  deviceGroupMatchingResponseSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import {
  artifactInputSchema,
  artifactWrapperSelect,
  artifactWrapperWithUrlsSchema,
} from "../artifacts/types";
import { scopedNoteSchema } from "../notes/schemas";

const canonicalRefInclude = {
  select: { canonicalName: true, canonicalDisplayName: true },
} as const;

const matchingInclude = {
  include: {
    manufacturer: canonicalRefInclude,
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
  artifacts: z.array(artifactInputSchema).optional(),
});

export const vulnerabilitySchema = z.object({
  id: z.string(),
  url: z.string(),
});

/**
 * What the manufacturer said about applying this remediation, as the source
 * platform sent it. Every field is optional because no source is obliged to
 * answer, and `{}` is what a remediation from any other origin carries.
 *
 * Loose on purpose: the source's own category and mechanism enums are still in
 * flux, so an unrecognised value is kept rather than rejected.
 */
export const sourceImpactSchema = z
  .object({
    category: z.string().nullish(),
    mechanism: z.string().nullish(),
    requiresDowntime: z.boolean().nullish(),
    estimatedDowntimeSeconds: z.number().nullish(),
    restartRequired: z.boolean().nullish(),
    disablesFeatures: z.boolean().nullish(),
    workflowImpact: z.string().nullish(),
    clinicalImpactNotes: z.string().nullish(),
  })
  .loose();
export type SourceImpact = z.infer<typeof sourceImpactSchema>;

export const remediationResponseSchema = z.object({
  id: z.string(),
  deviceGroupMatchings: z.array(deviceGroupMatchingResponseSchema),
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
  description: z.string().nullish(),
  narrative: z.string().nullish(),
  sourceImpact: sourceImpactSchema,
  vulnerability: vulnerabilitySchema.nullish(),
  user: userSchema,
  artifacts: z.array(artifactWrapperWithUrlsSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
  notes: z.array(scopedNoteSchema).optional(),
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
  externalMappings: externalMappingSelect,
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
