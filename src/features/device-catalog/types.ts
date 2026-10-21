import { z } from "zod";
import { createPaginatedResponseSchema } from "@/lib/pagination";
import { canonicalRefSchema, versSchemeSchema } from "@/lib/schemas";

const deviceTypeSchema = z
  .object({ slug: z.string(), displayName: z.string() })
  .nullable();

/** A reference to a manufacturer, product, or version, with its id and URL. */
export const linkedRefSchema = canonicalRefSchema.extend({
  id: z.string(),
  url: z.string(),
});

export const linkedRefSelect = {
  id: true,
  canonicalName: true,
  canonicalDisplayName: true,
  url: true,
} as const;

const deviceTypeSelect = {
  deviceType: { select: { slug: true, displayName: true } },
} as const;

export const manufacturerResponseSchema = canonicalRefSchema.extend({
  id: z.string(),
  nameMappings: z.array(z.string()),
  url: z.string(),
  productsUrl: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const manufacturerSelect = {
  ...linkedRefSelect,
  nameMappings: true,
  productsUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const productResponseSchema = canonicalRefSchema.extend({
  id: z.string(),
  nameMappings: z.array(z.string()),
  deviceType: deviceTypeSchema,
  manufacturer: linkedRefSchema,
  url: z.string(),
  versionsUrl: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const productSelect = {
  ...linkedRefSelect,
  nameMappings: true,
  ...deviceTypeSelect,
  manufacturer: { select: linkedRefSelect },
  versionsUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const versionResponseSchema = canonicalRefSchema.extend({
  id: z.string(),
  versScheme: versSchemeSchema.nullable(),
  udiDi: z.string().nullable(),
  product: linkedRefSchema.extend({ deviceType: deviceTypeSchema }),
  url: z.string(),
  vulnerabilitiesUrl: z.string(),
  assetsUrl: z.string(),
  deviceArtifactsUrl: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const versionSelect = {
  ...linkedRefSelect,
  versScheme: true,
  udiDi: true,
  product: { select: { ...linkedRefSelect, ...deviceTypeSelect } },
  vulnerabilitiesUrl: true,
  assetsUrl: true,
  deviceArtifactsUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const paginatedManufacturerResponseSchema =
  createPaginatedResponseSchema(manufacturerResponseSchema);
export const paginatedProductResponseSchema = createPaginatedResponseSchema(
  productResponseSchema,
);
export const paginatedVersionResponseSchema = createPaginatedResponseSchema(
  versionResponseSchema,
);
