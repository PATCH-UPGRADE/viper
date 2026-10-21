import { describe, expect, it } from "vitest";
import {
  baselineIssueStatus,
  matchingAppliesToDevice,
  matchingVersionFields,
  parseVers,
  resolveMatches,
  versSatisfies,
} from "../device-matching";

describe("parseVers", () => {
  it("parses the wildcard 'all' scheme", () => {
    expect(parseVers("vers:all/*")).toEqual({
      scheme: "all",
      matchesAll: true,
      constraints: [],
    });
  });

  it("parses a semver range with bounds", () => {
    const parsed = parseVers("vers:semver/>=2.1.2|<=2.1.4");
    expect(parsed?.scheme).toBe("semver");
    expect(parsed?.matchesAll).toBe(false);
    expect(parsed?.constraints).toEqual([
      { operator: ">=", version: "2.1.2" },
      { operator: "<=", version: "2.1.4" },
    ]);
  });

  it("returns null for non-VERS input without a recognizable body", () => {
    expect(parseVers("")).toBeNull();
    expect(parseVers("vers:semver")).toBeNull();
  });
});

describe("versSatisfies", () => {
  it("matches everything for an 'all' range", () => {
    expect(versSatisfies("9.9.9", "vers:all/*")).toBe(true);
    expect(versSatisfies(null, "vers:all/*")).toBe(true);
  });

  it("honors inclusive bounds", () => {
    const range = "vers:semver/>=2.1.2|<=2.1.4";
    expect(versSatisfies("2.1.3", range)).toBe(true);
    expect(versSatisfies("2.1.2", range)).toBe(true);
    expect(versSatisfies("2.1.4", range)).toBe(true);
    expect(versSatisfies("2.1.5", range)).toBe(false);
    expect(versSatisfies("2.1.1", range)).toBe(false);
  });

  it("never matches an unknown (null) version against a bounded range", () => {
    expect(versSatisfies(null, "vers:semver/>=1.0.0")).toBe(false);
  });
});

describe("matchingAppliesToDevice", () => {
  // device identity uses canonical FK ids; version carries its string.
  const dg = {
    id: "dg1",
    manufacturerId: "v-acme",
    productId: "p-radiator",
    versionId: "ver-213",
    version: { canonicalName: "2.1.3" },
  };

  it("is false when the manufacturer differs", () => {
    expect(
      matchingAppliesToDevice(
        {
          manufacturerId: "v-other",
          productId: null,
          versionId: null,
          versionRange: null,
        },
        dg,
      ),
    ).toBe(false);
  });

  it("is true for a wildcard-product matching (manufacturer only)", () => {
    expect(
      matchingAppliesToDevice(
        {
          manufacturerId: "v-acme",
          productId: null,
          versionId: null,
          versionRange: null,
        },
        dg,
      ),
    ).toBe(true);
  });

  it("is true when manufacturer+product match and there's no version constraint", () => {
    expect(
      matchingAppliesToDevice(
        {
          manufacturerId: "v-acme",
          productId: "p-radiator",
          versionId: null,
          versionRange: null,
        },
        dg,
      ),
    ).toBe(true);
  });

  it("is true for an exact versionId match", () => {
    expect(
      matchingAppliesToDevice(
        {
          manufacturerId: "v-acme",
          productId: "p-radiator",
          versionId: "ver-213",
          versionRange: null,
        },
        dg,
      ),
    ).toBe(true);
  });

  it("is false for a versionId mismatch", () => {
    expect(
      matchingAppliesToDevice(
        {
          manufacturerId: "v-acme",
          productId: "p-radiator",
          versionId: "ver-999",
          versionRange: null,
        },
        dg,
      ),
    ).toBe(false);
  });

  it("is true when the version falls in a VERS range", () => {
    expect(
      matchingAppliesToDevice(
        {
          manufacturerId: "v-acme",
          productId: "p-radiator",
          versionId: null,
          versionRange: "vers:semver/>=2.0.0|<3.0.0",
        },
        dg,
      ),
    ).toBe(true);
  });

  it("is false when the version is outside the VERS range", () => {
    expect(
      matchingAppliesToDevice(
        {
          manufacturerId: "v-acme",
          productId: "p-radiator",
          versionId: null,
          versionRange: "vers:semver/>=3.0.0",
        },
        dg,
      ),
    ).toBe(false);
  });
});

describe("resolveMatches", () => {
  const devices = [
    {
      id: "a",
      manufacturerId: "v-acme",
      productId: "p-radiator",
      versionId: "ver-213",
      version: { canonicalName: "2.1.3" },
    },
    {
      id: "b",
      manufacturerId: "v-acme",
      productId: "p-radiator",
      versionId: "ver-999",
      version: { canonicalName: "9.9.9" },
    },
    {
      id: "c",
      manufacturerId: "v-other",
      productId: "p-widget",
      versionId: "ver-100",
      version: { canonicalName: "1.0.0" },
    },
  ];

  it("resolves a wildcard-product matching to all of that manufacturer's devices", () => {
    const matches = resolveMatches(
      [
        {
          manufacturerId: "v-acme",
          productId: null,
          versionId: null,
          versionRange: null,
        },
      ],
      devices,
    );
    expect(matches.map((g) => g.id).sort()).toEqual(["a", "b"]);
  });

  it("dedupes a device matched by more than one matching", () => {
    const matches = resolveMatches(
      [
        {
          manufacturerId: "v-acme",
          productId: null,
          versionId: null,
          versionRange: null,
        }, // matches device a (and b)
        {
          manufacturerId: "v-acme",
          productId: "p-radiator",
          versionId: "ver-213",
          versionRange: null,
        }, // matches device a
      ],
      devices,
    );
    expect(matches.filter((g) => g.id === "a")).toHaveLength(1);
  });

  it("returns nothing when no device matches", () => {
    expect(
      resolveMatches(
        [
          {
            manufacturerId: "v-nobody",
            productId: null,
            versionId: null,
            versionRange: null,
          },
        ],
        devices,
      ),
    ).toEqual([]);
  });
});

describe("matchingVersionFields", () => {
  it("is UNKNOWN for a product with no version and no range", () => {
    expect(
      matchingVersionFields({ hasProduct: true, hasVersion: false }),
    ).toEqual({ versionRange: null, versionStatus: "UNKNOWN" });
  });

  it("is KNOWN for a version, a range, or no product", () => {
    expect(
      matchingVersionFields({ hasProduct: true, hasVersion: true }),
    ).toEqual({ versionRange: null, versionStatus: "KNOWN" });
    expect(
      matchingVersionFields({
        hasProduct: true,
        hasVersion: false,
        versionRange: " vers:semver/<2.0 ",
      }),
    ).toEqual({ versionRange: "vers:semver/<2.0", versionStatus: "KNOWN" });
    expect(
      matchingVersionFields({ hasProduct: false, hasVersion: false }),
    ).toEqual({ versionRange: null, versionStatus: "KNOWN" });
  });

  it("stores a range of every version as no range, KNOWN", () => {
    expect(
      matchingVersionFields({
        hasProduct: true,
        hasVersion: false,
        versionRange: "vers:all/*",
      }),
    ).toEqual({ versionRange: null, versionStatus: "KNOWN" });
  });
});

describe("baselineIssueStatus", () => {
  it("opens an UNKNOWN matching's issue under investigation", () => {
    expect(baselineIssueStatus("UNKNOWN")).toBe("UNDER_INVESTIGATION");
  });

  it("opens every other matching's issue as affected", () => {
    for (const status of ["KNOWN", "NOT_APPLICABLE", "UNSURE"] as const) {
      expect(baselineIssueStatus(status)).toBe("AFFECTED");
    }
  });
});
