import { z } from "zod";

const normalizedName = z
  .string()
  .min(1)
  .refine((name) => name === name.trim().toLowerCase(), {
    message: "must be trimmed and lowercase",
  });

export const manufacturerEntrySchema = z.object({
  canonicalName: normalizedName,
  canonicalDisplayName: z.string().min(1),
  hasCpe: z.boolean(),
  nameMappings: z.array(normalizedName),
});

export const manufacturerFileSchema = z
  .array(manufacturerEntrySchema)
  .refine(
    (entries) =>
      new Set(entries.map((entry) => entry.canonicalName)).size ===
      entries.length,
    { message: "each canonicalName may appear only once" },
  );

export type ManufacturerEntry = z.infer<typeof manufacturerEntrySchema>;

export const SIEMENS_HEALTHINEERS: ManufacturerEntry = {
  canonicalName: "siemens healthineers",
  canonicalDisplayName: "Siemens Healthineers",
  hasCpe: false,
  nameMappings: ["siemens", "siemens healthcare", "siemens medical solutions"],
};

export const GE_HEALTHCARE: ManufacturerEntry = {
  canonicalName: "ge healthcare",
  canonicalDisplayName: "GE HealthCare",
  hasCpe: false,
  nameMappings: ["gehealthcare", "ge medical systems"],
};

export const PHILIPS: ManufacturerEntry = {
  canonicalName: "philips",
  canonicalDisplayName: "Philips",
  hasCpe: true,
  nameMappings: ["philips healthcare", "royal philips", "koninklijke philips"],
};

export const MEDTRONIC: ManufacturerEntry = {
  canonicalName: "medtronic",
  canonicalDisplayName: "Medtronic",
  hasCpe: true,
  nameMappings: ["medtronic plc"],
};

export const BD: ManufacturerEntry = {
  canonicalName: "bd",
  canonicalDisplayName: "BD",
  hasCpe: true,
  nameMappings: ["becton dickinson", "becton, dickinson and company"],
};

export const BAXTER: ManufacturerEntry = {
  canonicalName: "baxter",
  canonicalDisplayName: "Baxter",
  hasCpe: true,
  nameMappings: ["baxter international", "baxter healthcare"],
};

export const CURATED_MANUFACTURERS: ManufacturerEntry[] = [
  SIEMENS_HEALTHINEERS,
  GE_HEALTHCARE,
  PHILIPS,
  MEDTRONIC,
  BD,
  BAXTER,
];
