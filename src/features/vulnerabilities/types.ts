import type { inferOutput } from "@trpc/tanstack-react-query";
import { z } from "zod";
import { Priority, type Prisma, Severity } from "@/generated/prisma";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import {
  alohaResponseSchema,
  cpeSchema,
  createIntegrationInputSchema,
  safeUrlSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import type { trpc } from "@/trpc/server";
import {
  deviceGroupSelect,
  deviceGroupWithUrlsSchema,
} from "../device-groups/types";
import { remediationCardInclude } from "../remediations/types";

// Validation schemas
const severitySchema = z.enum(Object.values(Severity));

export const vulnerabilityInputSchema = z.object({
  cpes: z.array(cpeSchema).min(1, "At least one CPE is required"),
  sarif: z.any(), // JSON data - Prisma JsonValue type
  cveId: z.string().min(1).nullish(),
  description: z.string().min(1).nullish(),
  narrative: z.string().min(1).nullish(),
  impact: z.string().min(1).nullish(),
  severity: severitySchema.optional(),
  cvssScore: z.number().min(0).max(10).nullish(),
  cvssVector: z.string().min(1).nullish(),
  affectedComponents: z.array(z.string().min(1)).optional(),
  exploitUri: safeUrlSchema.nullish(),
  upstreamApi: safeUrlSchema.nullish(),
  deviceArtifactId: z.string().min(1).nullish(),
});

export const vulnerabilityArrayInputSchema = z.object({
  vulnerabilities: z.array(vulnerabilityInputSchema).nonempty(),
});

export const vulnerabilityResponseSchema = z.object({
  id: z.string(),
  sarif: z.any(), // JSON data - Prisma JsonValue type
  affectedDeviceGroups: z.array(deviceGroupWithUrlsSchema),
  exploitUri: z.string().nullable(),
  upstreamApi: z.string().nullable(),
  description: z.string().nullable(),
  narrative: z.string().nullable(),
  impact: z.string().nullable(),
  cveId: z.string().nullable(),
  cvssScore: z.number().nullable(),
  severity: severitySchema,
  affectedComponents: z.array(z.string()),
  cvssVector: z.string().nullable(),
  epss: z.number().nullable(),
  updatedEpss: z.date().nullable(),
  inKEV: z.boolean(),
  updatedInKev: z.date().nullable(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
});
export type VulnerabilityResponse = z.infer<typeof vulnerabilityResponseSchema>;

export const vulnerabilityArrayResponseSchema = z.array(
  vulnerabilityResponseSchema,
);

export const paginatedVulnerabilityResponseSchema =
  createPaginatedResponseSchema(vulnerabilityResponseSchema);

export const integrationVulnerabilityInputSchema = createIntegrationInputSchema(
  vulnerabilityInputSchema,
);

export type VulnerabilitiesByPriorityCounts = inferOutput<
  typeof trpc.vulnerabilities.getPriorityMetricsInternal
>;

export const vulnerabilitiesByPriorityInputSchema =
  paginationInputSchema.extend({
    priority: z.enum(Object.values(Priority)),
  });

export const vulnerabilityInclude = {
  user: userIncludeSelect,
  affectedDeviceGroups: deviceGroupSelect,
};

export const vulnerabilityByPriorityInclude = {
  user: userIncludeSelect,
  affectedDeviceGroups: deviceGroupSelect,
  issues: {
    include: {
      asset: {
        select: {
          id: true,
          role: true,
          location: true,
        },
      },
    },
  },
  remediations: {
    include: remediationCardInclude,
  },
  _count: {
    select: {
      issues: true,
      remediations: true,
    },
  },
} satisfies Prisma.VulnerabilityInclude;

export type VulnerabilityWithRelations = Prisma.VulnerabilityGetPayload<{
  include: typeof vulnerabilityByPriorityInclude;
}>;

export const vulnerabilityAlohaResponseSchema = z.object({
  vulnerability: vulnerabilityResponseSchema,
  aloha: alohaResponseSchema,
});
