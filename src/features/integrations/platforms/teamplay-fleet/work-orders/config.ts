// Client-safe: the integration create form reads this shape, so nothing
// server-only may be added.

import { z } from "zod";
import { safeUrlSchema } from "@/lib/schemas";

/**
 * The site Siemens dispatches to. Fleet expects one of its own address records
 * (`type: "existing"` + `addressId`), which VIPER has no way to derive.
 */
export const fleetSiteAddressSchema = z.object({
  // Fleet only accepts a reference to one of its own address records.
  type: z.literal("existing").default("existing"),
  addressId: z.number(),
  locationName: z.string(),
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  tzCode: z.string().default(""),
  tzOffset: z.string().default(""),
});

export type FleetSiteAddress = z.infer<typeof fleetSiteAddressSchema>;

/**
 * The integration form renders every config field as a text input, so the
 * address arrives as a JSON string. Accept both that and an already-decoded
 * object, and read a blank box as "not set".
 */
const decodeSiteAddress = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // Hand the string on so the object schema reports the shape it wanted.
    return value;
  }
};

/**
 * Work order settings on `Integration.config`.
 *
 * Every field is optional, because a Fleet integration that syncs only assets
 * needs none of them. Each is required at its point of use instead, where the
 * error can name what is missing and why Fleet needs it.
 *
 * `createUrl` is not derivable: the activities collection is the read endpoint,
 * and Fleet does not create tickets there.
 */
export const workOrderConfigSchema = z.object({
  createUrl: safeUrlSchema.optional(),
  contactPhone: z.string().optional(),
  siteAddress: z
    .preprocess(decodeSiteAddress, fleetSiteAddressSchema.optional())
    .optional(),
});

export type FleetWorkOrderConfig = z.infer<typeof workOrderConfigSchema>;

/** Reads a required work order setting, naming it when it is absent. */
export function requireSetting<K extends keyof FleetWorkOrderConfig>(
  config: FleetWorkOrderConfig,
  key: K,
  why: string,
): NonNullable<FleetWorkOrderConfig[K]> {
  const value = config[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `The teamplay Fleet integration has no "${key}" configured — ${why}`,
    );
  }
  return value as NonNullable<FleetWorkOrderConfig[K]>;
}
