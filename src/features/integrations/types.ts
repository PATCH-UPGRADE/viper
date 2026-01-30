import { z } from "zod";
import { safeUrlSchema } from "@/lib/schemas";

const basicAuthSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const bearerAuthSchema = z.object({
  token: z.string(),
});

const headerAuthSchema = z.object({
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
    authType: z.enum(["Basic", "Bearer", "Header", "None"]),
    resourceType: z.enum(["Asset", "Vulnerability", "Emulator", "Remediation"]),
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
