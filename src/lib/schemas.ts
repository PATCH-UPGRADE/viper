import { z } from "zod";
import {
  AlohaStatus,
  AuthType,
  VersionStatus,
  VersScheme,
} from "@/generated/prisma";
import { createPaginatedResponseWithLinksSchema } from "./pagination";

/**
 * Shared Zod schema for User responses
 * Matches Prisma User model (name is required, email and image are nullable)
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

/**
 * Device-group match confidence, returned (computed) alongside a matched
 * vulnerability / remediation / advisory. Not stored in the database.
 */
export const dgMatchStatusSchema = z.enum([
  "VENDOR", // matches vendor only; unsure about product/version
  "PRODUCT", // matches vendor + product; unsure about version
  "VERSION_RANGE", // matches vendor + product, version falls in a VERS range
  "VERSION", // matches vendor + product + exact version
]);
export type DGMatchStatus = z.infer<typeof dgMatchStatusSchema>;

export const versionStatusSchema = z.enum(Object.values(VersionStatus));
export const versSchemeSchema = z.enum(Object.values(VersScheme));

/**
 * Input describing a (possibly fuzzy) device-group identity that a vulnerability
 * affects, in free-text form (resolved to canonical Vendor/Product/Version rows
 * server-side). `version` and `versionRange` are mutually exclusive ("nand").
 * `versionRange` uses VERS syntax (e.g. "vers:all/*", "vers:semver/>=2.1.2|<=2.1.4").
 */
export const deviceGroupMatchingInputSchema = z
  .object({
    vendor: z.string().min(1),
    product: z.string().min(1).nullish(),
    version: z.string().min(1).nullish(),
    versionRange: z.string().min(1).nullish(),
  })
  .refine((data) => !(data.version && data.versionRange), {
    message: "Only one of version or versionRange may be specified.",
    path: ["versionRange"],
  })
  .refine((data) => !(data.version && !data.product), {
    message: "version requires product to be specified.",
    path: ["version"],
  });
export type DeviceGroupMatchingInput = z.infer<
  typeof deviceGroupMatchingInputSchema
>;

/** A canonical vendor/product/version reference as returned by the API. */
const canonicalRefSchema = z.object({
  canonicalName: z.string(),
  canonicalDisplayName: z.string(),
});

/** A stored device-group matching as returned by the API. */
export const deviceGroupMatchingResponseSchema = z.object({
  id: z.string(),
  vendor: canonicalRefSchema,
  product: canonicalRefSchema.nullable(),
  version: canonicalRefSchema.nullable(),
  versionRange: z.string().nullable(),
});
export type DeviceGroupMatchingResponse = z.infer<
  typeof deviceGroupMatchingResponseSchema
>;

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
  const pagesWithLinksSchema = createPaginatedResponseWithLinksSchema(
    integrationInputSchema,
  );
  return pagesWithLinksSchema.extend({
    token: z.string(), // the user token calling this endpoint
  });
};

export const alohaInputSchema = z.object({
  status: z.enum(Object.keys(AlohaStatus)),
  log: z.any().optional(),
});

export const alohaResponseSchema = z.object({
  status: z.enum(Object.values(AlohaStatus)).nullable(),
  log: z.any(),
});
