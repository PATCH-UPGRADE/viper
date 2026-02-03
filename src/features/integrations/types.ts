import { z } from "zod";
import { safeUrlSchema } from "@/lib/schemas";

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

const authenticationSchema = z.union([
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
    resourceType: z.enum(["Asset", "Vulnerability", "DeviceArtifact", "Remediation"]),
    authentication: authenticationSchema.optional(),
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
