// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildStatusValuesSchema, toStatusValueSuggestions } from "./schema";

const values = ["Y", "N", "Repair"];
const schema = buildStatusValuesSchema(values);

const golden = {
  values: [
    { value: "Y", status: "Active", confidence: "Matched" },
    { value: "N", status: "Decommissioned", confidence: "NeedsReview" },
    { value: "Repair", status: "Maintenance", confidence: "Matched" },
  ],
};

describe("status values schema", () => {
  it("accepts the golden answer for an In Service column", () => {
    expect(schema.safeParse(golden).success).toBe(true);
  });

  it("accepts a value that means no VIPER status", () => {
    expect(
      schema.safeParse({
        values: [{ value: "N", status: null, confidence: "NeedsReview" }],
      }).success,
    ).toBe(true);
  });

  it("rejects Confirmed, which only a person may give", () => {
    expect(
      schema.safeParse({
        values: [{ value: "Y", status: "Active", confidence: "Confirmed" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a value that is not in the column", () => {
    expect(
      schema.safeParse({
        values: [{ value: "Yes", status: "Active", confidence: "Matched" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a status VIPER does not have", () => {
    expect(
      schema.safeParse({
        values: [{ value: "Y", status: "Retired", confidence: "Matched" }],
      }).success,
    ).toBe(false);
  });
});

describe("toStatusValueSuggestions", () => {
  it("answers every value once, in the column's order", () => {
    const suggestions = toStatusValueSuggestions(
      values,
      schema.parse({
        values: [
          { value: "N", status: "Decommissioned", confidence: "NeedsReview" },
          { value: "Y", status: "Active", confidence: "Matched" },
          { value: "Y", status: "Maintenance", confidence: "Matched" },
        ],
      }),
    );

    expect(suggestions).toEqual([
      { value: "Y", status: "Active", confidence: "Matched" },
      { value: "N", status: "Decommissioned", confidence: "NeedsReview" },
      { value: "Repair", status: null, confidence: "NeedsReview" },
    ]);
  });
});
