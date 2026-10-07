// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  columnMappingSchema,
  fieldSourceSchema,
  llmConfidenceSchema,
  MAX_CELL_LENGTH,
  productKey,
} from "../contract";

describe("name keys", () => {
  it("keys a product by its manufacturer, so one model name under two makers stays two products", () => {
    expect(productKey("BD", "Alaris 8015")).toBe("bd::alaris 8015");
    expect(productKey(" bd", "ALARIS 8015 ")).toBe(
      productKey("BD", "Alaris 8015"),
    );
    expect(productKey("Philips", "Alaris 8015")).not.toBe(
      productKey("BD", "Alaris 8015"),
    );
  });
});

describe("fieldSourceSchema", () => {
  it("rejects a blank constant", () => {
    expect(
      fieldSourceSchema.safeParse({ kind: "constant", value: "   " }).success,
    ).toBe(false);
  });

  it("rejects a constant longer than one cell may be", () => {
    expect(
      fieldSourceSchema.safeParse({
        kind: "constant",
        value: "x".repeat(MAX_CELL_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("rejects a column source with no header", () => {
    expect(
      fieldSourceSchema.safeParse({ kind: "column", header: "" }).success,
    ).toBe(false);
  });
});

describe("columnMappingSchema", () => {
  it("accepts a mapping that leaves most fields out", () => {
    expect(
      columnMappingSchema.safeParse({
        manufacturer: { kind: "column", header: "Mfr" },
        facility: { kind: "constant", value: "Main Campus" },
      }).success,
    ).toBe(true);
  });

  it("rejects a field VIPER does not import", () => {
    expect(
      columnMappingSchema.safeParse({
        assetTag: { kind: "column", header: "Asset Tag" },
      }).success,
    ).toBe(false);
  });
});

describe("llmConfidenceSchema", () => {
  it("never lets a model claim a human confirmation", () => {
    expect(llmConfidenceSchema.safeParse("Matched").success).toBe(true);
    expect(llmConfidenceSchema.safeParse("NeedsReview").success).toBe(true);
    expect(llmConfidenceSchema.safeParse("Confirmed").success).toBe(false);
  });
});
