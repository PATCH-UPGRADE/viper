import { describe, expect, it } from "vitest";
import {
  CURATED_MANUFACTURERS,
  manufacturerFileSchema,
  SIEMENS_HEALTHINEERS,
} from "../manufacturer-catalog";

describe("CURATED_MANUFACTURERS", () => {
  it("passes the same schema an imported backup file must pass", () => {
    expect(
      manufacturerFileSchema.safeParse(CURATED_MANUFACTURERS).success,
    ).toBe(true);
  });

  it("never lets two curated manufacturers claim the same name", () => {
    const everyClaimedName = CURATED_MANUFACTURERS.flatMap((entry) => [
      entry.canonicalName,
      ...entry.nameMappings,
    ]);
    expect(new Set(everyClaimedName).size).toBe(everyClaimedName.length);
  });

  it("maps the CPE vendor token 'siemens' to Siemens Healthineers", () => {
    expect(SIEMENS_HEALTHINEERS.nameMappings).toContain("siemens");
  });
});

describe("manufacturerFileSchema", () => {
  const validEntry = {
    canonicalName: "acme medical",
    canonicalDisplayName: "Acme Medical",
    hasCpe: false,
    nameMappings: ["acme"],
  };

  it("rejects a name that is not lowercase", () => {
    const result = manufacturerFileSchema.safeParse([
      { ...validEntry, nameMappings: ["ACME"] },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects a name with surrounding spaces", () => {
    const result = manufacturerFileSchema.safeParse([
      { ...validEntry, canonicalName: " acme medical" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects a file that lists the same canonicalName twice", () => {
    const result = manufacturerFileSchema.safeParse([validEntry, validEntry]);
    expect(result.success).toBe(false);
  });
});
