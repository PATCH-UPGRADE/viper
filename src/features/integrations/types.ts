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

export const integrationInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  platform: z.string().optional(),
  integrationUri: safeUrlSchema,
  isGeneric: z.boolean(),
  prompt: z.string().optional(), // only allowed if `isGeneric` is true
  authType: z.enum(["Basic", "Bearer", "Header", "None"]),
  resourceType: z.enum(["Asset", "Vulnerability", "Emulator", "Remediation"]),
  authentication: authenticationSchema.optional(),
  syncEvery: z.number().int().positive().min(60),
});
export type IntegrationFormValues = z.infer<typeof integrationInputSchema>;
