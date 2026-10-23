import { describe, expect, it } from "vitest";
import {
  EntityFilterError,
  resolveEntityFilter,
  TARGET_MODEL_REGISTRY,
  validateEntityFilter,
} from "../entity-filter";

describe("validateEntityFilter", () => {
  describe("ASSET", () => {
    it("accepts a scalar equality filter (shorthand and long form)", () => {
      expect(
        validateEntityFilter("ASSET", { hostname: "CT-BRIGHT-001" }).success,
      ).toBe(true);
      expect(
        validateEntityFilter("ASSET", {
          hostname: { equals: "CT-BRIGHT-001" },
        }).success,
      ).toBe(true);
    });

    it("accepts string operators (in / contains)", () => {
      expect(
        validateEntityFilter("ASSET", {
          networkSegment: { contains: "ICU" },
          status: { in: ["Active", "Maintenance"] },
        }).success,
      ).toBe(true);
    });

    it("accepts the device ids on the asset", () => {
      const result = validateEntityFilter("ASSET", {
        productId: "prod_infusion_pump",
        versionStatus: "UNKNOWN",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a device type through product", () => {
      expect(
        validateEntityFilter("ASSET", {
          product: { deviceType: { slug: "infusion-pump" } },
        }).success,
      ).toBe(true);
      expect(
        validateEntityFilter("ASSET", {
          product: { deviceTypeId: "dt_infusion_pump" },
        }).success,
      ).toBe(true);
    });

    it("accepts a UDI through version", () => {
      expect(
        validateEntityFilter("ASSET", {
          version: { udiDi: "00843197100156" },
        }).success,
      ).toBe(true);
    });

    it("rejects the removed deviceGroup hop", () => {
      expect(
        validateEntityFilter("ASSET", {
          deviceGroup: { productId: "prod_infusion_pump" },
        }).success,
      ).toBe(false);
    });

    it("rejects role, which is free text", () => {
      expect(
        validateEntityFilter("ASSET", { role: "CT Scanner" }).success,
      ).toBe(false);
    });

    it("accepts AND / OR / NOT composition", () => {
      const result = validateEntityFilter("ASSET", {
        OR: [
          { networkSegment: { contains: "ICU" } },
          { manufacturerId: "manufacturer_1" },
        ],
        NOT: { status: "Decommissioned" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts an empty filter (matches all)", () => {
      expect(validateEntityFilter("ASSET", {}).success).toBe(true);
    });

    it("returns the parsed where object on success", () => {
      const result = validateEntityFilter("ASSET", {
        hostname: "CT-BRIGHT-001",
      });
      expect(result).toEqual({
        success: true,
        data: { hostname: "CT-BRIGHT-001" },
      });
    });

    it("rejects an unknown field", () => {
      const result = validateEntityFilter("ASSET", { bogusColumn: "x" });
      expect(result.success).toBe(false);
    });

    it("rejects an unknown operator", () => {
      const result = validateEntityFilter("ASSET", {
        hostname: { startsWithh: "CT" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects a relation hop into a non-allowlisted relation", () => {
      const result = validateEntityFilter("ASSET", {
        user: { id: "user_1" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects a wrongly-typed value", () => {
      const result = validateEntityFilter("ASSET", { hostname: 42 });
      expect(result.success).toBe(false);
    });

    it("accepts a valid ISO datetime on a date field", () => {
      expect(
        validateEntityFilter("ASSET", {
          createdAt: { gte: "2024-01-01T00:00:00.000Z" },
        }).success,
      ).toBe(true);
      expect(
        validateEntityFilter("ASSET", { createdAt: "2024-01-01T00:00:00Z" })
          .success,
      ).toBe(true);
    });

    it("rejects a malformed datetime on a date field", () => {
      expect(
        validateEntityFilter("ASSET", { createdAt: "2024-01-01" }).success,
      ).toBe(false);
      expect(
        validateEntityFilter("ASSET", { createdAt: { gte: "not-a-date" } })
          .success,
      ).toBe(false);
    });

    it("rejects Json columns that are intentionally not exposed", () => {
      // `location` is a Json column and is deliberately omitted from the
      // allowlist.
      expect(
        validateEntityFilter("ASSET", { location: { facility: "Main" } })
          .success,
      ).toBe(false);
    });
  });

  describe("VULNERABILITY", () => {
    it("accepts severity and priority", () => {
      expect(
        validateEntityFilter("VULNERABILITY", {
          severity: "Critical",
          priority: { in: ["Critical", "High"] },
        }).success,
      ).toBe(true);
    });

    it("accepts an identifier filter through some / none", () => {
      expect(
        validateEntityFilter("VULNERABILITY", {
          identifiers: { some: { value: "CVE-2024-1234" } },
        }).success,
      ).toBe(true);
      expect(
        validateEntityFilter("VULNERABILITY", {
          identifiers: {
            none: { value: { startsWith: "ghsa-", mode: "insensitive" } },
          },
        }).success,
      ).toBe(true);
    });

    it("rejects an identifier filter without some / every / none", () => {
      expect(
        validateEntityFilter("VULNERABILITY", {
          identifiers: { value: "CVE-2024-1234" },
        }).success,
      ).toBe(false);
    });
  });

  describe("REMEDIATION and DEVICE_GROUP_MATCHING", () => {
    it("accepts allowlisted remediation fields", () => {
      expect(
        validateEntityFilter("REMEDIATION", {
          id: "rem_1",
        }).success,
      ).toBe(true);
    });

    it("accepts allowlisted device group matching fields", () => {
      expect(
        validateEntityFilter("DEVICE_GROUP_MATCHING", {
          manufacturerId: "manufacturer_1",
          productId: { in: ["p1", "p2"] },
        }).success,
      ).toBe(true);
    });
  });

  it("covers every ScopeTargetModel in the registry", () => {
    expect(Object.keys(TARGET_MODEL_REGISTRY).sort()).toEqual([
      "ASSET",
      "DEVICE_GROUP_MATCHING",
      "REMEDIATION",
      "VULNERABILITY",
    ]);
  });
});

describe("resolveEntityFilter", () => {
  it("throws EntityFilterError for an invalid filter before touching the db", async () => {
    await expect(
      resolveEntityFilter("ASSET", { bogusColumn: "x" }),
    ).rejects.toBeInstanceOf(EntityFilterError);
  });
});
