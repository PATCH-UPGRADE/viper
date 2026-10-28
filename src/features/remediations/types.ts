import { z } from "zod";
import { externalMappingSelect } from "@/features/integrations/core/urls";
import { PlatformEnum, type Prisma } from "@/generated/prisma";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import {
  alohaResponseSchema,
  createIntegrationInputSchema,
  deviceGroupMatchingResponseSchema,
  deviceInputSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import {
  artifactInputSchema,
  artifactWrapperSelect,
  artifactWrapperWithUrlsSchema,
} from "../artifacts/types";
import { scopedNoteSchema } from "../notes/schemas";
import {
  featureImpactSchema,
  remediationImpactFieldsSchema,
  remediationImpactRowSchema,
  remediationImpactRowSelect,
} from "./impact";
import {
  remediationReleaseFieldsSchema,
  remediationReleaseResponseSchema,
} from "./release";

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
  devices: z
    .array(deviceInputSchema)
    .optional()
    .describe(
      "The devices that the remediation applies to. Each one names its version, a VERS range, or every version with vers:all/*.",
    ),
  vulnerabilityIds: z.array(z.string()).optional(),
  description: z.string().nullish(),
  narrative: z.string().nullish(),
  ...remediationImpactFieldsSchema.shape,
  ...remediationReleaseFieldsSchema.shape,
  impacts: z.array(featureImpactSchema).optional(),
  artifacts: z
    .array(artifactInputSchema)
    .min(1, "at least one artifact is required"),
});

export const integrationRemediationInputSchema = createIntegrationInputSchema(
  remediationInputSchema,
);

export const remediationUpdateSchema = z.object({
  id: z.string(),
  devices: z.array(deviceInputSchema).optional(),
  // Replaces the whole set when present. An empty array clears every link.
  vulnerabilityIds: z.array(z.string()).optional(),
  description: z.string().nullish(),
  narrative: z.string().nullish(),
  ...remediationImpactFieldsSchema.shape,
  ...remediationReleaseFieldsSchema.shape,
  impacts: z.array(featureImpactSchema).optional(),
  artifacts: z.array(artifactInputSchema).optional(),
});

export const vulnerabilitySchema = z.object({
  id: z.string(),
  url: z.string(),
});

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
  ...remediationImpactFieldsSchema.shape,
  ...remediationReleaseResponseSchema.shape,
  isManufacturerRemediation: z.boolean(),
  impacts: z.array(remediationImpactRowSchema),
  vulnerabilities: z.array(vulnerabilitySchema),
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
  vulnerabilities: remediationVulnerabilitySelect,
  artifacts: artifactWrapperSelect,
  externalMappings: externalMappingSelect,
  impacts: remediationImpactRowSelect,
};

export const remediationCardInclude = {
  user: userIncludeSelect,
  artifacts: artifactWrapperSelect,
  externalMappings: externalMappingSelect,
  _count: { select: { vulnerabilities: true } },
} as const;

export type RemediationCard = Prisma.RemediationGetPayload<{
  include: typeof remediationCardInclude;
}>;

export const remediationAlohaResponseSchema = z.object({
  remediation: remediationResponseSchema,
  aloha: alohaResponseSchema,
});
