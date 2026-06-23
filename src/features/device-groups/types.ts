import { z } from "zod";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import { versionStatusSchema } from "@/lib/schemas";

const canonicalRefSchema = z.object({
  canonicalName: z.string(),
  canonicalDisplayName: z.string(),
});

export const deviceGroupSchema = z.object({
  id: z.string(),
  vendor: canonicalRefSchema.nullable(),
  product: canonicalRefSchema.nullable(),
  version: canonicalRefSchema.nullable(),
  versionStatus: versionStatusSchema,
  cpe: z.array(z.string()),
  udi: z.string().nullable(),
});

export const paginationInputWithUpdatedAtFilterFields =
  paginationInputSchema.extend({
    updatedAtStartTime: z.date().optional(),
    updatedAtEndTime: z.date().optional(),
  });

export const deviceGroupInputSchema = z
  .object({
    id: z.string(),
    vendor: z.string().min(1).optional(),
    product: z.string().min(1).optional(),
    version: z.string().min(1).nullish(),
    versionStatus: versionStatusSchema.optional(),
    udi: z.string().nullish(),
  })
  .refine(
    (data) =>
      data.vendor !== undefined ||
      data.product !== undefined ||
      data.version !== undefined ||
      data.versionStatus !== undefined ||
      data.udi !== undefined,
    { message: "At least one field must be provided." },
  );

export const deviceGroupInputHelmIdSchema = z.object({
  id: z.string(),
  helmSbomId: z.string(),
});

export const helmSbomResponseSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    sbom: z.json().nullish(),
    product_name: z.string().nullish(),
    version: z.string().nullish(),
    product_uuid: z.string().nullish(),
    product_version_uuid: z.string().nullish(),
  }),
  z.object({
    success: z.literal(false),
    error_type: z.string(),
    message: z.string(),
  }),
]);

export type DeviceGroupIncludeType = z.infer<typeof deviceGroupSchema>;

export const deviceGroupWithUrlsSchema = deviceGroupSchema.extend({
  url: z.string(),
  sbomUrl: z.string().nullable(),
  vulnerabilitiesUrl: z.string(),
  deviceArtifactsUrl: z.string(),
  assetsUrl: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type DeviceGroupWithUrls = z.infer<typeof deviceGroupWithUrlsSchema>;

export const deviceGroupWithDetailsSchema = deviceGroupWithUrlsSchema.extend({
  helmSbomId: z.string().nullable(),
});

export type DeviceGroupWithDetails = z.infer<
  typeof deviceGroupWithDetailsSchema
>;

export const paginatedDeviceGroupResponseSchema = createPaginatedResponseSchema(
  deviceGroupWithDetailsSchema,
);

const canonicalRefSelect = {
  select: { canonicalName: true, canonicalDisplayName: true },
} as const;

export const deviceGroupSelect = {
  select: {
    id: true,
    vendor: canonicalRefSelect,
    product: canonicalRefSelect,
    version: canonicalRefSelect,
    versionStatus: true,
    cpe: true,
    udi: true,
    url: true,
    sbomUrl: true,
    vulnerabilitiesUrl: true,
    assetsUrl: true,
    deviceArtifactsUrl: true,
    createdAt: true,
    updatedAt: true,
  },
} as const;
