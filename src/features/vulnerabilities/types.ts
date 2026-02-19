import type { inferOutput } from "@trpc/tanstack-react-query";
import { z } from "zod";
import { Priority, type Prisma, Severity } from "@/generated/prisma";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import {
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

// Validation schemas
const severitySchema = z.enum(Object.values(Severity));

export const vulnerabilityInputSchema = z.object({
  cpes: z.array(cpeSchema).min(1, "At least one CPE is required"),
  sarif: z.any(), // JSON data - Prisma JsonValue type
  cveId: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  narrative: z.string().min(1).optional(),
  impact: z.string().min(1).optional(),
  severity: severitySchema.optional(),
  cvssScore: z.number().min(0).max(10).optional(),
  cvssVector: z.string().min(1).optional(),
  affectedComponents: z.array(z.string().min(1)).optional(),
  exploitUri: safeUrlSchema.optional(),
  upstreamApi: safeUrlSchema.optional(),
  deviceArtifactId: z.string().min(1).optional(),
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
    include: {
      user: userIncludeSelect,
      _count: {
        select: {
          artifacts: true,
        },
      },
    },
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
