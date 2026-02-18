import { z } from "zod";

export const deviceGroupSchema = z.object({
  id: z.string(),
  cpe: z.string(),
});
export type DeviceGroupIncludeType = z.infer<typeof deviceGroupSchema>;
export const deviceGroupWithUrlsSchema = deviceGroupSchema.extend({
  url: z.string(),
  sbomUrl: z.string().nullable(), // TODO: VW-54
  vulnerabilitiesUrl: z.string(),
  deviceArtifactsUrl: z.string(),
  assetsUrl: z.string(),
});
export type DeviceGroupWithUrls = z.infer<typeof deviceGroupWithUrlsSchema>;
export const deviceGroupWithDetailsSchema = deviceGroupWithUrlsSchema.extend({
  manufacturer: z.string().nullable(),
  modelName: z.string().nullable(),
  version: z.string().nullable(),
  helmSbomId: z.string().nullable(),
});
export type DeviceGroupWithDetails = z.infer<
  typeof deviceGroupWithDetailsSchema
>;

export const deviceGroupSelect = {
  select: {
    id: true,
    cpe: true,
    url: true,
    sbomUrl: true,
    vulnerabilitiesUrl: true,
    assetsUrl: true,
    deviceArtifactsUrl: true,
  },
} as const;
