import { describe, expect, it } from "vitest";
import type {
  AssetImportField,
  ColumnMapping,
  SuggestMappingOutput,
} from "../../contract";
import {
  assignColumn,
  columnSuggestionFrom,
  columnsToCheck,
  columnsToConfirm,
  dropFields,
  fieldForHeader,
  requiredFieldsNotSet,
  requiredFieldsWithoutColumn,
  setConstant,
  statusValueRows,
} from "../columns";

const HEADERS = ["Asset Tag", "Mfr", "Model", "SW Rev", "In Service"];

const SUGGESTION: SuggestMappingOutput = {
  fields: {
    manufacturer: { header: "Mfr", confidence: "Matched" },
    product: { header: "Model", confidence: "Matched" },
    version: { header: "SW Rev", confidence: "NeedsReview" },
    status: { header: "In Service", confidence: "NeedsReview" },
    room: { header: "Not A Header", confidence: "Matched" },
  },
  statusValues: [
    { value: "Y", status: "Active", confidence: "Matched" },
    { value: "N", status: null, confidence: "NeedsReview" },
  ],
};

describe("columnSuggestionFrom", () => {
  const suggestion = columnSuggestionFrom(SUGGESTION, HEADERS);

  it("maps each suggested field to its column and drops headers the file lacks", () => {
    expect(suggestion.mapping).toEqual({
      manufacturer: { kind: "column", header: "Mfr" },
      product: { kind: "column", header: "Model" },
      version: { kind: "column", header: "SW Rev" },
      status: { kind: "column", header: "In Service" },
    });
    expect(suggestion.fieldConfidence.version).toBe("NeedsReview");
  });

  it("keeps the suggested status for each value", () => {
    expect(suggestion.statusValues).toEqual({ Y: "Active", N: null });
    expect(suggestion.statusConfidence).toEqual({
      Y: "Matched",
      N: "NeedsReview",
    });
  });
});

describe("assignColumn", () => {
  const mapping: ColumnMapping = {
    manufacturer: { kind: "column", header: "Mfr" },
    version: { kind: "column", header: "SW Rev" },
  };

  it("moves a column to a different field", () => {
    expect(assignColumn(mapping, "SW Rev", "role")).toEqual({
      manufacturer: { kind: "column", header: "Mfr" },
      role: { kind: "column", header: "SW Rev" },
    });
  });

  it("takes a field away from the column that had it", () => {
    expect(assignColumn(mapping, "Model", "manufacturer")).toEqual({
      manufacturer: { kind: "column", header: "Model" },
      version: { kind: "column", header: "SW Rev" },
    });
  });

  it("stops importing a column", () => {
    expect(assignColumn(mapping, "Mfr", null)).toEqual({
      version: { kind: "column", header: "SW Rev" },
    });
  });

  it("finds which field a column feeds", () => {
    expect(fieldForHeader(mapping, "SW Rev")).toBe("version");
    expect(fieldForHeader(mapping, "Asset Tag")).toBeNull();
  });
});

describe("setConstant", () => {
  it("sets one value for every device", () => {
    expect(setConstant({}, "facility", "Mercy General")).toEqual({
      facility: { kind: "constant", value: "Mercy General" },
    });
  });

  it("clears the value when the text is blank", () => {
    const mapping: ColumnMapping = {
      facility: { kind: "constant", value: "Mercy General" },
    };
    expect(setConstant(mapping, "facility", "  ")).toEqual({});
  });
});

describe("dropFields", () => {
  it("removes the named fields only", () => {
    const mapping: ColumnMapping = {
      ip: { kind: "column", header: "IP Address" },
      room: { kind: "column", header: "Room" },
    };
    expect(dropFields(mapping, ["ip"])).toEqual({
      room: { kind: "column", header: "Room" },
    });
  });
});

describe("fields every device needs", () => {
  it("lists manufacturer and model until each has a column or one value for all", () => {
    expect(requiredFieldsNotSet({})).toEqual(["manufacturer", "product"]);
    expect(
      requiredFieldsNotSet({
        manufacturer: { kind: "column", header: "Mfr" },
      }),
    ).toEqual(["product"]);
    expect(
      requiredFieldsNotSet({
        manufacturer: { kind: "column", header: "Mfr" },
        product: { kind: "constant", value: "Alaris 8015" },
      }),
    ).toEqual([]);
  });

  it("keeps showing a required field that is one value for all, so it can still be changed", () => {
    expect(
      requiredFieldsWithoutColumn({
        manufacturer: { kind: "column", header: "Mfr" },
        product: { kind: "constant", value: "Alaris 8015" },
      }),
    ).toEqual(["product"]);
  });
});

describe("columns to check", () => {
  const suggestion = columnSuggestionFrom(SUGGESTION, HEADERS);
  const rowCounts = new Map([
    ["Y", 1147],
    ["N", 57],
  ]);

  it("lists unconfirmed unsure columns, and Status while a value needs a pick", () => {
    const statusRows = statusValueRows(
      rowCounts,
      suggestion.statusValues,
      suggestion.statusConfidence,
      new Set(),
    );
    expect(
      columnsToCheck(
        suggestion.mapping,
        suggestion.fieldConfidence,
        new Set(),
        statusRows,
      ),
    ).toEqual(["version", "status"]);
  });

  it("asks to confirm only the columns VIPER guessed without being sure", () => {
    const stillToConfirm = (confirmedFields: AssetImportField[]) =>
      columnsToConfirm(
        suggestion.mapping,
        suggestion.fieldConfidence,
        new Set(confirmedFields),
      );

    expect(stillToConfirm([])).toEqual(["version", "status"]);
    expect(stillToConfirm(["version"])).toEqual(["status"]);
    expect(stillToConfirm(["version", "status"])).toEqual([]);
  });

  it("keeps Status open until every unsure value is picked", () => {
    const statusRows = statusValueRows(
      rowCounts,
      suggestion.statusValues,
      suggestion.statusConfidence,
      new Set(),
    );
    expect(
      columnsToCheck(
        suggestion.mapping,
        suggestion.fieldConfidence,
        new Set(["version", "status"]),
        statusRows,
      ),
    ).toEqual(["status"]);
  });

  it("is empty once columns are confirmed and values picked", () => {
    const statusRows = statusValueRows(
      rowCounts,
      { ...suggestion.statusValues, N: "Decommissioned" },
      suggestion.statusConfidence,
      new Set(["N"]),
    );
    expect(
      statusRows.map((row) => [row.value, row.status, row.needsPick]),
    ).toEqual([
      ["Y", "Active", false],
      ["N", "Decommissioned", false],
    ]);
    expect(
      columnsToCheck(
        suggestion.mapping,
        suggestion.fieldConfidence,
        new Set(["version", "status"]),
        statusRows,
      ),
    ).toEqual([]);
  });
});
