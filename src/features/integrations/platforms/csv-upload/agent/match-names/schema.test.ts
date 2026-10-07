// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildNameMatchSchema, toNameSuggestions } from "./schema";

const candidateIds = ["mfr_ge", "mfr_bd", "mfr_siemens"];
const schema = buildNameMatchSchema(
  ["GE Healthcare", "Siemens", "Acme Biomedical"],
  candidateIds,
);

const golden = {
  matches: [
    {
      name: "GE Healthcare",
      id: "mfr_ge",
      confidence: "Matched",
      reason: "Same company; VIPER spells it GE HealthCare.",
    },
    {
      name: "Siemens",
      id: "mfr_siemens",
      confidence: "NeedsReview",
      reason: "Siemens Healthineers is the medical arm of Siemens.",
    },
    {
      name: "Acme Biomedical",
      id: null,
      confidence: "NeedsReview",
      reason: "No listed manufacturer is this company.",
    },
  ],
};

describe("name match schema", () => {
  it("rejects Confirmed, which only a person may give", () => {
    expect(
      schema.safeParse({
        matches: [{ ...golden.matches[0], confidence: "Confirmed" }],
      }).success,
    ).toBe(false);
  });

  it("rejects an id that was not offered", () => {
    expect(
      schema.safeParse({
        matches: [{ ...golden.matches[0], id: "mfr_philips" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a name that was not asked about", () => {
    expect(
      schema.safeParse({
        matches: [{ ...golden.matches[0], name: "Philips" }],
      }).success,
    ).toBe(false);
  });
});

describe("toNameSuggestions", () => {
  it("keeps one suggestion per name and drops the names with no match", () => {
    const suggestions = toNameSuggestions(schema.parse(golden), candidateIds);

    expect([...suggestions.keys()]).toEqual(["GE Healthcare", "Siemens"]);
    expect(suggestions.get("Siemens")).toEqual({
      id: "mfr_siemens",
      confidence: "NeedsReview",
      reason: "Siemens Healthineers is the medical arm of Siemens.",
    });
  });

  it("ignores an id outside the candidates it was given", () => {
    const suggestions = toNameSuggestions(schema.parse(golden), ["mfr_ge"]);

    expect([...suggestions.keys()]).toEqual(["GE Healthcare"]);
  });
});
