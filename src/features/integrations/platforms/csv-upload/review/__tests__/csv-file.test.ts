import { describe, expect, it } from "vitest";
import { MAX_IMPORT_FILE_BYTES } from "../../contract";
import {
  countRowsByValue,
  distinctValuesByHeader,
  parseCsvFile,
  problemBeforeReading,
  sampleRowsFor,
} from "../csv-file";

const BIOMED_EXPORT = [
  "Asset Tag,Mfr,Model,Serial No,In Service",
  "BIO-0417,GE Healthcare,LOGIQ e,GE-LQ-2019-001,Y",
  "",
  "BIO-0852,BD,Alaris 8015,8015-77231,Y",
  "   ,  ,  ,  ,  ",
  'BIO-1020,Siemens,"SOMATOM go.Up, CT",108877,N',
].join("\n");

describe("problemBeforeReading", () => {
  it("refuses a spreadsheet that isn't a CSV", () => {
    expect(
      problemBeforeReading({ name: "biomed_export.xlsx", size: 10 }),
    ).toEqual({ kind: "notCsv" });
  });

  it("refuses a file over the size limit and reports its size", () => {
    const size = MAX_IMPORT_FILE_BYTES + 1;
    expect(problemBeforeReading({ name: "full_export.CSV", size })).toEqual({
      kind: "tooLarge",
      sizeBytes: size,
    });
  });

  it("accepts a CSV at exactly the limit", () => {
    expect(
      problemBeforeReading({ name: "a.csv", size: MAX_IMPORT_FILE_BYTES }),
    ).toBeNull();
  });
});

describe("parseCsvFile", () => {
  it("splits the header row from device rows and skips blank lines", () => {
    const { headers, rows } = parseCsvFile(BIOMED_EXPORT);
    expect(headers).toEqual([
      "Asset Tag",
      "Mfr",
      "Model",
      "Serial No",
      "In Service",
    ]);
    expect(rows).toEqual([
      ["BIO-0417", "GE Healthcare", "LOGIQ e", "GE-LQ-2019-001", "Y"],
      ["BIO-0852", "BD", "Alaris 8015", "8015-77231", "Y"],
      ["BIO-1020", "Siemens", "SOMATOM go.Up, CT", "108877", "N"],
    ]);
  });

  it("names blank headers by position and numbers repeated ones", () => {
    const { headers } = parseCsvFile("Room,,Room,Room\n1,2,3,4");
    expect(headers).toEqual(["Room", "Column 2", "Room (2)", "Room (3)"]);
  });

  it("returns no rows for a file with only a header row", () => {
    expect(parseCsvFile("Asset Tag,Mfr\n").rows).toEqual([]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsvFile("")).toEqual({ headers: [], rows: [] });
  });
});

describe("distinctValuesByHeader", () => {
  const { headers, rows } = parseCsvFile(BIOMED_EXPORT);

  it("lists each column's trimmed, non-empty values once", () => {
    expect(distinctValuesByHeader(headers, rows)["In Service"]).toEqual([
      "Y",
      "N",
    ]);
  });

  it("leaves out a column with more distinct values than the limit", () => {
    const values = distinctValuesByHeader(headers, rows, 2);
    expect(values).not.toHaveProperty("Asset Tag");
    expect(values).toHaveProperty("In Service");
  });
});

describe("sampleRowsFor", () => {
  it("keys the first rows by header", () => {
    const { headers, rows } = parseCsvFile(BIOMED_EXPORT);
    expect(sampleRowsFor(headers, rows)[1]).toEqual({
      "Asset Tag": "BIO-0852",
      Mfr: "BD",
      Model: "Alaris 8015",
      "Serial No": "8015-77231",
      "In Service": "Y",
    });
  });
});

describe("countRowsByValue", () => {
  it("counts the rows behind each value of one column", () => {
    const { headers, rows } = parseCsvFile(BIOMED_EXPORT);
    expect(countRowsByValue(headers, rows, "In Service")).toEqual(
      new Map([
        ["Y", 2],
        ["N", 1],
      ]),
    );
  });
});
