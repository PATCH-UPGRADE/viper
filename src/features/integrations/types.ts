import { z } from "zod";
<<<<<<< HEAD
import { safeUrlSchema, UserIncludeType } from "@/lib/schemas";
import { Integration, ResourceType, SyncStatus } from "@/generated/prisma";
import { inferOutput } from "@trpc/tanstack-react-query";
import { trpc } from "@/trpc/server";
=======
import type { Integration } from "@/generated/prisma";
import { safeUrlSchema } from "@/lib/schemas";
>>>>>>> origin/main

export const basicAuthSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const bearerAuthSchema = z.object({
  token: z.string(),
});

export const headerAuthSchema = z.object({
  header: z.string(),
  value: z.string(),
});

export const authenticationSchema = z.union([
  basicAuthSchema,
  bearerAuthSchema,
  headerAuthSchema,
]);
export type AuthenticationInputType = z.infer<typeof authenticationSchema>;

export const integrationInputSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    platform: z.string().optional(),
    integrationUri: safeUrlSchema,
    isGeneric: z.boolean(),
    prompt: z.string().optional(),
    authType: z.enum(["Basic", "Bearer", "Header", "None"]),
    resourceType: z.enum([
      "Asset",
      "Vulnerability",
      "DeviceArtifact",
      "Remediation",
    ]),
    authentication: authenticationSchema.optional().nullable(),
    syncEvery: z.number().int().positive().min(60),
  })
  .superRefine((value, ctx) => {
    if (value.authType !== "None" && !value.authentication) {
      ctx.addIssue({
        code: "custom",
        message:
          "Authentication details are required for the selected auth type.",
        path: ["authentication"],
      });
    }
  });
export type IntegrationFormValues = z.infer<typeof integrationInputSchema>;

export const integrationsMapping = {
  // TODO: extend with deviceArtifact and remediations
  assets: {
    name: "Asset",
    type: ResourceType.Asset,
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
