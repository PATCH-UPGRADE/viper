import { z } from "zod";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";

export const deviceGroupSchema = z.object({
  id: z.string(),
  vendor: z.string(),
  product: z.string(),
  version: z.string().nullable(),
  gudid: z.string().nullable(),
  cpes: z.array(z.object({ cpe: z.string() })),
});

export const paginationInputWithUpdatedAtFilterFields =
  paginationInputSchema.extend({
    updatedAtStartTime: z.date().optional(),
    updatedAtEndTime: z.date().optional(),
  });

export const deviceGroupInputSchema = z
  .object({
    id: z.string(),
    vendor: z.string().optional(),
    product: z.string().optional(),
    version: z.string().nullish(),
    gudid: z.string().nullish(),
  })
  .refine(
    (data) =>
      data.vendor !== undefined ||
      data.product !== undefined ||
      data.version !== undefined ||
      data.gudid !== undefined,
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

export const deviceGroupSelect = {
  select: {
    id: true,
    vendor: true,
    product: true,
    version: true,
    gudid: true,
    cpes: { select: { cpe: true } },
    url: true,
    sbomUrl: true,
    vulnerabilitiesUrl: true,
    assetsUrl: true,
    deviceArtifactsUrl: true,
    createdAt: true,
    updatedAt: true,
  },
} as const;
