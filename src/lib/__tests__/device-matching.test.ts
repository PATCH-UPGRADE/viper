import { describe, expect, it } from "vitest";
import {
  computeMatchStatus,
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

describe("computeMatchStatus", () => {
  // device group identity uses canonical FK ids; version carries its string.
  const dg = {
    id: "dg1",
    vendorId: "v-acme",
    productId: "p-radiator",
    versionId: "ver-213",
    version: { canonicalName: "2.1.3" },
  };

  it("returns null when the vendor differs", () => {
    expect(
      computeMatchStatus(
        {
          vendorId: "v-other",
          productId: null,
          versionId: null,
          versionRange: null,
        },
        dg,
      ),
    ).toBeNull();
  });

  it("returns VENDOR for a wildcard-product matching", () => {
    expect(
      computeMatchStatus(
        {
          vendorId: "v-acme",
          productId: null,
          versionId: null,
          versionRange: null,
        },
        dg,
      ),
    ).toBe("VENDOR");
  });

  it("returns PRODUCT when vendor+product match and no version constraint", () => {
    expect(
      computeMatchStatus(
        {
          vendorId: "v-acme",
          productId: "p-radiator",
          versionId: null,
          versionRange: null,
        },
        dg,
      ),
    ).toBe("PRODUCT");
  });

  it("returns VERSION for an exact versionId match", () => {
    expect(
      computeMatchStatus(
        {
          vendorId: "v-acme",
          productId: "p-radiator",
          versionId: "ver-213",
          versionRange: null,
        },
        dg,
      ),
    ).toBe("VERSION");
  });

  it("returns null for a versionId mismatch", () => {
    expect(
      computeMatchStatus(
        {
          vendorId: "v-acme",
          productId: "p-radiator",
          versionId: "ver-999",
          versionRange: null,
        },
        dg,
      ),
    ).toBeNull();
  });

  it("returns VERSION_RANGE when the version falls in a VERS range", () => {
    expect(
      computeMatchStatus(
        {
          vendorId: "v-acme",
          productId: "p-radiator",
          versionId: null,
          versionRange: "vers:semver/>=2.0.0|<3.0.0",
        },
        dg,
      ),
    ).toBe("VERSION_RANGE");
  });

  it("returns null when the version is outside the VERS range", () => {
    expect(
      computeMatchStatus(
        {
          vendorId: "v-acme",
          productId: "p-radiator",
          versionId: null,
          versionRange: "vers:semver/>=3.0.0",
        },
        dg,
      ),
    ).toBeNull();
  });
});

describe("resolveMatches", () => {
  const groups = [
    {
      id: "a",
      vendorId: "v-acme",
      productId: "p-radiator",
      versionId: "ver-213",
      version: { canonicalName: "2.1.3" },
    },
    {
      id: "b",
      vendorId: "v-acme",
      productId: "p-radiator",
      versionId: "ver-999",
      version: { canonicalName: "9.9.9" },
    },
    {
      id: "c",
      vendorId: "v-other",
      productId: "p-widget",
      versionId: "ver-100",
      version: { canonicalName: "1.0.0" },
    },
  ];

  it("resolves a wildcard-product matching to all of that vendor's groups", () => {
    const matches = resolveMatches(
      [
        {
          vendorId: "v-acme",
          productId: null,
          versionId: null,
          versionRange: null,
        },
      ],
      groups,
    );
    expect(matches.map((m) => m.deviceGroup.id).sort()).toEqual(["a", "b"]);
    expect(matches.every((m) => m.matchStatus === "VENDOR")).toBe(true);
  });

  it("keeps the strongest match status when multiple matchings overlap", () => {
    const matches = resolveMatches(
      [
        {
          vendorId: "v-acme",
          productId: null,
          versionId: null,
          versionRange: null,
        }, // VENDOR for group a
        {
          vendorId: "v-acme",
          productId: "p-radiator",
          versionId: "ver-213",
          versionRange: null,
        }, // VERSION for group a
      ],
      groups,
    );
    const groupA = matches.find((m) => m.deviceGroup.id === "a");
    expect(groupA?.matchStatus).toBe("VERSION");
  });

  it("returns nothing when no group matches", () => {
    expect(
      resolveMatches(
        [
          {
            vendorId: "v-nobody",
            productId: null,
            versionId: null,
            versionRange: null,
          },
        ],
        groups,
      ),
    ).toEqual([]);
  });
});
