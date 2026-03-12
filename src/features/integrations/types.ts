import type { inferOutput } from "@trpc/tanstack-react-query";
import { z } from "zod";
import { type Integration, ResourceType, Prisma, AuthType } from "@/generated/prisma";
import { authSchema, safeUrlSchema } from "@/lib/schemas";
import type { trpc } from "@/trpc/server";

export const integrationInputSchema = authSchema.safeExtend({
  name: z.string().min(1, "Name is required"),
  platform: z.string().optional(),
  integrationUri: safeUrlSchema,
  isGeneric: z.boolean(),
  prompt: z.string().optional(),
  resourceType: z.enum([
    "Asset",
    "Vulnerability",
    "DeviceArtifact",
    "Remediation",
  ]),
  syncEvery: z.number().int().positive().min(60),
});
export type IntegrationFormValues = z.infer<typeof integrationInputSchema>;

export function isValidIntegrationKey(
  key: string,
): key is keyof typeof integrationsMapping {
  return key in integrationsMapping;
}

export const integrationsMapping = {
  assets: {
    name: "Asset",
    type: ResourceType.Asset,
  },
  deviceArtifacts: {
    name: "Device Artifact",
    type: ResourceType.DeviceArtifact,
  },
  remediations: {
    name: "Remediation",
    type: ResourceType.Remediation,
  },
  vulnerabilities: {
    name: "Vulnerability",
    type: ResourceType.Vulnerability,
  },
};

export type IntegrationWithRelations = inferOutput<
  typeof trpc.integrations.update
>;

export type IntegrationWithStringDates = Omit<
  Integration,
  "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};

export const syncStatusIntegrationInclude = {
  syncStatus: {
    select: {
      status: true,
      syncedAt: true,
      errorMessage: true,
    },
    orderBy: {
      syncedAt: "desc", // newest first
    },
  },
} as const;

// This was the cleanest thing I could come up with
// I manually specify the fields instead of using something like
// export type IntegrationWithSyncStatus = Prisma.IntegrationGetPayload<{
//  include: typeof syncStatusIntegrationInclude;
// }>;
// That's because syncStatus gets converted from a date into a string in sync-integrations.ts
export type IntegrationWithSyncStatus = {
  authType: AuthType;
  integrationUri: string;
  resourceType: ResourceType;
  syncStatus: {
    syncedAt: string;
  }[];
  authentication: unknown;
};
