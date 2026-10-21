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

/** A manufacturer, product, or version, named by its id or by its name. */
const catalogRefSchema = z.union([
  z.strictObject({ id: z.string().min(1) }),
  z.strictObject({ name: z.string().trim().min(1) }),
]);

/**
 * The devices that a vulnerability, remediation, or device artifact applies to.
 * An id must exist. A name that does not exist is created inside its parent.
 * The version is required, so "every version" is an explicit range.
 */
export const deviceInputSchema = z.object({
  manufacturer: catalogRefSchema,
  product: catalogRefSchema,
  version: z
    .union([
      catalogRefSchema,
      z.strictObject({
        range: z
          .string()
          .trim()
          .regex(/^vers:/, "A range is a VERS string that starts with vers:"),
      }),
      z.strictObject({ status: z.enum(["UNKNOWN", "NOT_APPLICABLE"]) }),
    ])
    .describe(
      'One version, or { range } with a VERS string, for example "vers:semver/>=8.0|<8.2". Use { "range": "vers:all/*" } for every version, { "status": "UNKNOWN" } when the source gives no version, and { "status": "NOT_APPLICABLE" } for a product that has no versions.',
    ),
});
export type DeviceInput = z.infer<typeof deviceInputSchema>;

/**
 * An asset's device. Its version can be a status instead, which says why the
 * asset has no version, so a version and a status cannot both be sent.
 */
export const assetDeviceInputSchema = z.object({
  manufacturer: catalogRefSchema,
  product: catalogRefSchema.optional(),
  version: z
    .union([
      catalogRefSchema,
      z.strictObject({ status: z.enum(["UNKNOWN", "UNSURE"]) }),
    ])
    .describe(
      "The asset's version, or { status } when the version is not known. A version needs a product.",
    ),
});
export type AssetDeviceInput = z.infer<typeof assetDeviceInputSchema>;

export const versionStatusSchema = z.enum(Object.values(VersionStatus));
export const versSchemeSchema = z.enum(Object.values(VersScheme));

/** A canonical manufacturer/product/version reference as returned by the API. */
export const canonicalRefSchema = z.object({
  canonicalName: z.string(),
  canonicalDisplayName: z.string(),
});

/** A stored device-group matching as returned by the API. */
export const deviceGroupMatchingResponseSchema = z.object({
  id: z.string(),
  manufacturer: canonicalRefSchema,
  product: canonicalRefSchema.nullable(),
  version: canonicalRefSchema.nullable(),
  versionRange: z.string().nullable(),
  versionStatus: versionStatusSchema,
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
/** One synced item: the resource's input plus where it came from upstream. */
export const createIntegrationItemSchema = <T extends z.ZodRawShape>(
  inputSchema: z.ZodObject<T>,
) =>
  inputSchema.extend({
    externalId: z.string(),
    upstreamApi: safeUrlSchema.nullish(), // the API endpoint
    webUrl: safeUrlSchema.nullish(), // where a human looks at it
  });

/**
 * The upload envelope a platform POSTs back to
 * `/{resource}/integrationUpload/{token}`.
 */
export const createIntegrationInputSchema = <T extends z.ZodRawShape>(
  inputSchema: z.ZodObject<T>,
) => {
  const pagesWithLinksSchema = createPaginatedResponseWithLinksSchema(
    createIntegrationItemSchema(inputSchema),
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
