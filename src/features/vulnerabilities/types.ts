import { z } from "zod";
import { Severity } from "@/generated/prisma";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import {
  cpeSchema,
  createIntegrationInputSchema,
  safeUrlSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
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

export const vulnerabilityInclude = {
  user: userIncludeSelect,
  affectedDeviceGroups: deviceGroupSelect,
};
