import { describe, expect, it } from "vitest";
import { UNKNOWN_FLEET_PRODUCT } from "@/features/integrations/platforms/teamplay-fleet/assets/equipments";
import { DEVICE_TYPES, FLEET_PRODUCT_DEVICE_TYPES } from "../device-types";

describe("DEVICE_TYPES", () => {
  it("has unique slugs", () => {
    const slugs = DEVICE_TYPES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("stores nameMappings in lowercase with no outer spaces", () => {
    for (const { slug, nameMappings } of DEVICE_TYPES) {
      for (const mapping of nameMappings) {
        expect(mapping, slug).toBe(mapping.trim().toLowerCase());
      }
    }
  });

  // No DB constraint stops two device types from matching one string, and
  // resolveDeviceType then returns an arbitrary row.
  it("matches each string to at most one device type", () => {
    const owner = new Map<string, string>();
    for (const { slug, displayName, nameMappings } of DEVICE_TYPES) {
      const keys = new Set([displayName.trim().toLowerCase(), ...nameMappings]);
      for (const key of keys) {
        expect(owner.get(key), `"${key}" on ${slug}`).toBeUndefined();
        owner.set(key, slug);
      }
    }
  });
});

describe("FLEET_PRODUCT_DEVICE_TYPES", () => {
  it("only uses seeded slugs", () => {
    const slugs = new Set(DEVICE_TYPES.map((t) => t.slug));
    for (const [product, slug] of Object.entries(FLEET_PRODUCT_DEVICE_TYPES)) {
      expect(slugs.has(slug), product).toBe(true);
    }
  });

  it("never types the shared Fleet fallback product", () => {
    expect(FLEET_PRODUCT_DEVICE_TYPES).not.toHaveProperty(
      UNKNOWN_FLEET_PRODUCT,
    );
  });
});
