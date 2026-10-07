import { describe, expect, it } from "vitest";
import type { ColumnMapping } from "../../contract";
import { importReviewFor } from "../plan";

const HEADERS = ["Mfr", "Model", "Serial No", "IP Address"];
const ROWS_WITH_DASHED_IPS = Array.from({ length: 12 }, (_, index) => [
  "BD",
  "Alaris 8015",
  `S-${index}`,
  `10-40-1-${index}`,
]);
const FILE = {
  headers: HEADERS,
  rows: [
    ...ROWS_WITH_DASHED_IPS,
    ["BD", "Alaris 8015", "S-0", "10.0.0.1"],
    ["BD", "", "S-99", ""],
  ],
};
const MAPPING: ColumnMapping = {
  manufacturer: { kind: "column", header: "Mfr" },
  product: { kind: "column", header: "Model" },
  serialNumber: { kind: "column", header: "Serial No" },
  ip: { kind: "column", header: "IP Address" },
};

describe("importReviewFor", () => {
  const review = importReviewFor(FILE, MAPPING, {});

  it("flags a column whose values mostly fail and imports without it", () => {
    expect(review.flaggedColumns.map((column) => column.field)).toEqual(["ip"]);
    expect(review.planMapping).not.toHaveProperty("ip");
    expect(review.importRows.every((row) => row.ip === null)).toBe(true);
  });

  it("keeps each row's original cells for staging", () => {
    expect(review.importRows[0].raw).toEqual(ROWS_WITH_DASHED_IPS[0]);
    expect(review.rowsByNumber.get(15)?.raw).toEqual(["BD", "", "S-99", ""]);
  });

  it("lists a repeated serial as a repeat and a missing model as a row issue", () => {
    expect(review.repeatedRows).toEqual([
      { rowNumber: 14, reason: "Serial also used by row 2 in this file" },
    ]);
    expect(review.conflicts.get(15)).toBe("Model is missing");
    expect(
      review.issueGroups.map((group) => [group.field, group.kind]),
    ).toEqual([["product", "missing"]]);
  });
});
