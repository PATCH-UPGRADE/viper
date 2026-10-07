// @vitest-environment node
import { describe, expect, it } from "vitest";
import { COLUMN_FLAG_THRESHOLD } from "../contract";
import {
  columnIssues,
  isValidIp,
  isValidMac,
  type RowIssue,
} from "../validate";

describe("isValidIp", () => {
  it.each([
    "10.40.1.30",
    "0.0.0.0",
    "255.255.255.255",
    "fe80::1",
    "::1",
    "2001:db8:0:0:0:0:0:1",
  ])("accepts %s", (value) => {
    expect(isValidIp(value)).toBe(true);
  });

  it.each([
    "10.20.4.256",
    "10.40.1",
    "10-40-1-30",
    "0A28011E",
    "10.040.001.030",
    "1::2::3",
    "a:b",
    "",
  ])("rejects %s", (value) => {
    expect(isValidIp(value)).toBe(false);
  });
});

describe("isValidMac", () => {
  it.each(["00:1A:2B:3C:50:30", "00-1a-2b-3c-50-30"])("accepts %s", (value) => {
    expect(isValidMac(value)).toBe(true);
  });

  it.each([
    "001A.2B3C.5030",
    "00:1A-2B:3C:50:30",
    "00:1A:2B:3C:50",
    "00:1A:2B:3C:50:3G",
  ])("rejects %s", (value) => {
    expect(isValidMac(value)).toBe(false);
  });
});

const invalidIpAt = (rowNumber: number): RowIssue => ({
  rowNumber,
  field: "ip",
  kind: "invalidIp",
  value: "10-40-1-30",
});

describe("columnIssues", () => {
  it("lists a few bad values row by row", () => {
    const issues = [invalidIpAt(188), invalidIpAt(733)];

    expect(columnIssues(issues, 1204)).toEqual([
      {
        field: "ip",
        failedCount: 2,
        totalRows: 1204,
        wholeColumn: false,
        issues,
      },
    ]);
  });

  it("flags the whole column once more than the threshold of values fail", () => {
    const atThreshold = Array.from({ length: COLUMN_FLAG_THRESHOLD }, (_, i) =>
      invalidIpAt(i + 2),
    );
    const overThreshold = [...atThreshold, invalidIpAt(999)];

    expect(columnIssues(atThreshold, 1204)[0].wholeColumn).toBe(false);
    expect(columnIssues(overThreshold, 1204)[0].wholeColumn).toBe(true);
  });

  it("groups by field, in the order VIPER lists its fields", () => {
    const missingManufacturer: RowIssue = {
      rowNumber: 5,
      field: "manufacturer",
      kind: "missing",
      value: "",
    };

    const fields = columnIssues([invalidIpAt(3), missingManufacturer], 10).map(
      (column) => column.field,
    );

    expect(fields).toEqual(["manufacturer", "ip"]);
  });
});
