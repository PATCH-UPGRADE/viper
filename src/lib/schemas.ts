import { z } from "zod";
import { AuthType } from "@/generated/prisma";
import { createPaginatedResponseWithLinksSchema } from "./pagination";

/**
 * Shared Zod schema for User responses
 * Matches Prisma User model (name and email are required, image is nullable)
 */
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  image: z.string().nullable(),
});
export type UserIncludeType = z.infer<typeof userSchema>;

/**
 * Reusable URL validator to prevent javascript: and other dangerous protocols
 * Only allows http, https, and git protocols
 */
export const safeUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => {
      try {
        const protocol = new URL(url).protocol;
        return (
          protocol === "http:" || protocol === "https:" || protocol === "git:"
        );
      } catch {
        return false;
      }
    },
    { message: "Only http(s) and git URLs allowed" },
  );

/**
 * CPE 2.3 format validator
 * Validates Common Platform Enumeration strings
 */
export const cpeSchema = z
  .string()
  .regex(/^cpe:2\.3:[^:]+:[^:]+:[^:]+/, "Invalid CPE 2.3 format");

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

export const authSchema = z
  .object({
    authType: z.enum(Object.values(AuthType)),
    authentication: authenticationSchema.optional(),
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

/**
 * Shared user include/select pattern for Prisma queries
 * Use this consistently across all routers when including user relations
 */
export const userIncludeSelect = {
  select: {
    id: true,
    name: true,
    email: true,
    image: true,
  },
} as const;

export const integrationResponseSchema = z.object({
  message: z.string(),
  createdItemsCount: z.number(),
  updatedItemsCount: z.number(),
  shouldRetry: z.boolean(),
  syncedAt: z.string(),
});
export type IntegrationResponse = z.infer<typeof integrationResponseSchema>;
export const createIntegrationInputSchema = <T extends z.ZodRawShape>(
  inputSchema: z.ZodObject<T>,
) => {
  const integrationInputSchema = inputSchema.extend({
    vendorId: z.string(),
  });
  return createPaginatedResponseWithLinksSchema(integrationInputSchema);
};
