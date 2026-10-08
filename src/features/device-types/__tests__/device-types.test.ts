import { describe, expect, it, vi } from "vitest";
import { UNKNOWN_FLEET_PRODUCT } from "@/features/integrations/platforms/teamplay-fleet/assets/equipments";
import { DEVICE_TYPES, FLEET_PRODUCT_DEVICE_TYPES } from "../device-types";

vi.mock("@/lib/db", () => ({ default: {} }));

const { EXAMPLE_PRODUCT_DEVICE_TYPES } = await import(
  "../../../../prisma/seeds/production/device-types"
);

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

describe.each([
  ["FLEET_PRODUCT_DEVICE_TYPES", FLEET_PRODUCT_DEVICE_TYPES],
  ["EXAMPLE_PRODUCT_DEVICE_TYPES", EXAMPLE_PRODUCT_DEVICE_TYPES],
])("%s", (_, products) => {
  it("only uses seeded slugs", () => {
    const slugs = new Set(DEVICE_TYPES.map((t) => t.slug));
    for (const [product, slug] of Object.entries(products)) {
      expect(slugs.has(slug), product).toBe(true);
    }
  });
});

describe("FLEET_PRODUCT_DEVICE_TYPES", () => {
  it("never types the shared Fleet fallback product", () => {
    expect(FLEET_PRODUCT_DEVICE_TYPES).not.toHaveProperty(
      UNKNOWN_FLEET_PRODUCT,
    );
  });
});

describe("EXAMPLE_PRODUCT_DEVICE_TYPES", () => {
  // upsertExampleProduct looks products up by lowercase name.
  it("has lowercase keys", () => {
    for (const name of Object.keys(EXAMPLE_PRODUCT_DEVICE_TYPES)) {
      expect(name).toBe(name.trim().toLowerCase());
    }
  });
});
