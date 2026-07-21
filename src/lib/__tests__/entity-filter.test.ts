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
        validateEntityFilter("ASSET", { role: "CT Scanner" }).success,
      ).toBe(true);
      expect(
        validateEntityFilter("ASSET", {
          role: { equals: "CT Scanner" },
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

    it("accepts a single relation hop through deviceGroup", () => {
      const result = validateEntityFilter("ASSET", {
        deviceGroup: { productId: "prod_infusion_pump" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts AND / OR / NOT composition", () => {
      const result = validateEntityFilter("ASSET", {
        OR: [
          { networkSegment: { contains: "ICU" } },
          { deviceGroup: { vendorId: "vendor_1" } },
        ],
        NOT: { status: "Decommissioned" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts an empty filter (matches all)", () => {
      expect(validateEntityFilter("ASSET", {}).success).toBe(true);
    });

    it("returns the parsed where object on success", () => {
      const result = validateEntityFilter("ASSET", { role: "CT Scanner" });
      expect(result).toEqual({ success: true, data: { role: "CT Scanner" } });
    });

    it("rejects an unknown field", () => {
      const result = validateEntityFilter("ASSET", { bogusColumn: "x" });
      expect(result.success).toBe(false);
    });

    it("rejects an unknown operator", () => {
      const result = validateEntityFilter("ASSET", {
        role: { startsWithh: "CT" },
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
      const result = validateEntityFilter("ASSET", { role: 42 });
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
    it("accepts numeric and boolean operators", () => {
      expect(
        validateEntityFilter("VULNERABILITY", {
          cvssScore: { gte: 7 },
          inKEV: true,
          severity: "Critical",
        }).success,
      ).toBe(true);
    });

    it("accepts a string-list filter on affectedComponents", () => {
      expect(
        validateEntityFilter("VULNERABILITY", {
          affectedComponents: { has: "openssl" },
        }).success,
      ).toBe(true);
    });

    it("rejects a number operator given a string", () => {
      expect(
        validateEntityFilter("VULNERABILITY", { cvssScore: { gte: "7" } })
          .success,
      ).toBe(false);
    });
  });

  describe("REMEDIATION and DEVICE_GROUP_MATCHING", () => {
    it("accepts allowlisted remediation fields", () => {
      expect(
        validateEntityFilter("REMEDIATION", {
          vulnerabilityId: "vuln_1",
        }).success,
      ).toBe(true);
    });

    it("accepts allowlisted device group matching fields", () => {
      expect(
        validateEntityFilter("DEVICE_GROUP_MATCHING", {
          vendorId: "vendor_1",
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
