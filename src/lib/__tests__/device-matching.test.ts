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
  const dg = { vendor: "Acme", product: "Radiator", version: "2.1.3" };

  it("returns null when the vendor differs", () => {
    expect(computeMatchStatus({ vendor: "Other" }, dg)).toBeNull();
  });

  it("returns VENDOR for a vendor-only match object", () => {
    expect(computeMatchStatus({ vendor: "acme" }, dg)).toBe("VENDOR");
  });

  it("returns PRODUCT when vendor+product match and no version constraint", () => {
    expect(
      computeMatchStatus({ vendor: "Acme", product: "radiator" }, dg),
    ).toBe("PRODUCT");
  });

  it("returns VERSION for an exact version match", () => {
    expect(
      computeMatchStatus(
        { vendor: "Acme", product: "Radiator", version: "2.1.3" },
        dg,
      ),
    ).toBe("VERSION");
  });

  it("returns null for an exact version mismatch", () => {
    expect(
      computeMatchStatus(
        { vendor: "Acme", product: "Radiator", version: "2.1.4" },
        dg,
      ),
    ).toBeNull();
  });

  it("returns VERSION_RANGE when the version falls in a VERS range", () => {
    expect(
      computeMatchStatus(
        {
          vendor: "Acme",
          product: "Radiator",
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
          vendor: "Acme",
          product: "Radiator",
          versionRange: "vers:semver/>=3.0.0",
        },
        dg,
      ),
    ).toBeNull();
  });
});

describe("resolveMatches", () => {
  const groups = [
    { id: "a", vendor: "Acme", product: "Radiator", version: "2.1.3" },
    { id: "b", vendor: "Acme", product: "Radiator", version: "9.9.9" },
    { id: "c", vendor: "Other", product: "Widget", version: "1.0.0" },
  ];

  it("resolves a vendor-only match object to all of that vendor's groups", () => {
    const matches = resolveMatches([{ vendor: "Acme" }], groups);
    expect(matches.map((m) => m.deviceGroup.id).sort()).toEqual(["a", "b"]);
    expect(matches.every((m) => m.matchStatus === "VENDOR")).toBe(true);
  });

  it("keeps the strongest match status when multiple match objects overlap", () => {
    const matches = resolveMatches(
      [
        { vendor: "Acme" }, // VENDOR for group a
        { vendor: "Acme", product: "Radiator", version: "2.1.3" }, // VERSION for group a
      ],
      groups,
    );
    const groupA = matches.find((m) => m.deviceGroup.id === "a");
    expect(groupA?.matchStatus).toBe("VERSION");
  });

  it("returns nothing when no group matches", () => {
    expect(resolveMatches([{ vendor: "Nobody" }], groups)).toEqual([]);
  });
});
