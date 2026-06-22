import { z } from "zod";

// TODO: Get a discriminated union of what fields should actually live on Advisory|Recall|UpdateAvailable (see `details`)
export const notificationPayloadSchema = z.object({
  type: z.enum(["Advisory", "Recall", "UpdateAvailable", "Other"]),
  title: z.string(),
  summary: z.string(),
  tlp: z
    .enum(["WHITE", "GREEN", "AMBER", "RED", "CLEAR", "AMBER_STRICT"])
    .nullable(),
});

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;


// A device group referenced by a notification. All fields are optional so the
// model can emit whatever identifiers it finds; downstream code skips entries
// with no usable identifier.
// TODO: add new fields like UDI after VW-283 gets merged in
// TODO: add new fields like versionRange after VW-283 gets merged in (used to link individual assets?)
// TODO: if we can find more data, add something like serialRange
// TODO: What about more unique ID's for specific vendors? e.g, Siemens has material number as a unique device group code
export const extractedDeviceGroupSchema = z.object({
  cpe: z.string().nullish(),
  manufacturer: z.string().nullish(),
  modelName: z.string().nullish(),
  version: z.string().nullish(),
});

// TODO: extend this, which has just device groups for now, with vulnerabilities
// and remediations
export const extractSchema = z.object({
  deviceGroups: z.array(extractedDeviceGroupSchema),
  summary: z.string(),
});

export type ExtractedDeviceGroup = z.infer<typeof extractedDeviceGroupSchema>;
export type ExtractResult = z.infer<typeof extractSchema>;
