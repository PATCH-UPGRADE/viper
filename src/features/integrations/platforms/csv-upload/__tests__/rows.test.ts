// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ColumnMapping } from "../contract";
import { buildRows } from "../rows";

const headers = [
  "Asset Tag",
  "Device Description",
  "Mfr",
  "Model",
  "SW Rev",
  "Serial No",
  "IP Address",
  "MAC",
  "Bldg",
  "Room",
  "Dept",
  "In Service",
];

const BIO_0417 = [
  "BIO-0417",
  "Portable ultrasound",
  "GE Healthcare",
  "LOGIQ e",
  "R7",
  "GE-LQ-2019-001",
  "10.40.1.30",
  "00:1A:2B:3C:50:30",
  "Imaging Department",
  "Ultrasound Bay 1",
  "Radiology",
  "Y",
];
const BIO_0852 = [
  "BIO-0852",
  "Infusion pump",
  "BD",
  "Alaris 8015",
  "12.1.2",
  "8015-77231",
  "",
  "",
  "Main Tower",
  "4W-12",
  "ICU",
  "Y",
];
const BIO_0853 = [
  "BIO-0853",
  "Infusion pump",
  "BD",
  "Alaris 8015",
  "12.1.2",
  "n/a",
  "",
  "",
  "Main Tower",
  "4W-14",
  "ICU",
  "Y",
];

const column = (header: string) => ({ kind: "column" as const, header });

const mapping: ColumnMapping = {
  role: column("Device Description"),
  manufacturer: column("Mfr"),
  product: column("Model"),
  version: column("SW Rev"),
  serialNumber: column("Serial No"),
  ip: column("IP Address"),
  macAddress: column("MAC"),
  building: column("Bldg"),
  room: column("Room"),
  status: column("In Service"),
  facility: { kind: "constant", value: "Main Campus" },
};

const statusValues = { Y: "Active", N: "Decommissioned" } as const;

const build = (rawRows: string[][], overrides: ColumnMapping = {}) =>
  buildRows({
    headers,
    rawRows,
    mapping: { ...mapping, ...overrides },
    statusValues,
  });

const withCell = (row: string[], header: string, value: string) =>
  row.map((cell, index) => (headers[index] === header ? value : cell));

describe("buildRows", () => {
  it("turns a real CMMS row into an asset row", () => {
    const { rows, issues } = build([BIO_0417]);

    expect(issues).toEqual([]);
    expect(rows).toEqual([
      {
        rowNumber: 2,
        role: "Portable ultrasound",
        manufacturer: "GE Healthcare",
        product: "LOGIQ e",
        version: "R7",
        serialNumber: "GE-LQ-2019-001",
        ip: "10.40.1.30",
        macAddress: "00:1A:2B:3C:50:30",
        hostname: null,
        networkSegment: null,
        status: "Active",
        facility: "Main Campus",
        building: "Imaging Department",
        floor: null,
        room: "Ultrasound Bay 1",
      },
    ]);
  });

  it("numbers rows as the spreadsheet does, with the header on row 1", () => {
    const { rows } = build([BIO_0417, BIO_0852, BIO_0853]);

    expect(rows.map((row) => row.rowNumber)).toEqual([2, 3, 4]);
  });

  it("leaves an empty IP and MAC empty without calling them invalid", () => {
    const { rows, issues } = build([BIO_0852]);

    expect(rows[0].ip).toBeNull();
    expect(rows[0].macAddress).toBeNull();
    expect(issues).toEqual([]);
  });

  it("drops a placeholder serial without reporting it", () => {
    const { rows, issues } = build([BIO_0853]);

    expect(rows[0].serialNumber).toBeNull();
    expect(issues).toEqual([]);
  });

  it("imports an invalid IP as empty and reports it", () => {
    const { rows, issues } = build([
      withCell(BIO_0417, "IP Address", "10.20.4.256"),
    ]);

    expect(rows[0].ip).toBeNull();
    expect(issues).toEqual([
      { rowNumber: 2, field: "ip", kind: "invalidIp", value: "10.20.4.256" },
    ]);
  });

  it("imports an invalid MAC as empty and reports it", () => {
    const { rows, issues } = build([
      withCell(BIO_0417, "MAC", "001A.2B3C.5030"),
    ]);

    expect(rows[0].macAddress).toBeNull();
    expect(issues).toEqual([
      {
        rowNumber: 2,
        field: "macAddress",
        kind: "invalidMac",
        value: "001A.2B3C.5030",
      },
    ]);
  });

  it("cuts a cell that is too long and reports it", () => {
    const longRoom = "R".repeat(300);
    const { rows, issues } = build([withCell(BIO_0417, "Room", longRoom)]);

    expect(rows[0].room).toBe("R".repeat(256));
    expect(issues).toEqual([
      { rowNumber: 2, field: "room", kind: "tooLong", value: longRoom },
    ]);
  });

  it("reports a row with no manufacturer or model", () => {
    const { issues } = build([
      withCell(withCell(BIO_0417, "Mfr", " "), "Model", ""),
    ]);

    expect(issues).toEqual([
      { rowNumber: 2, field: "manufacturer", kind: "missing", value: "" },
      { rowNumber: 2, field: "product", kind: "missing", value: "" },
    ]);
  });

  it("maps status through the reviewed values and leaves an unknown value empty", () => {
    const { rows } = build([
      withCell(BIO_0417, "In Service", "N"),
      withCell(BIO_0417, "In Service", "Maybe"),
    ]);

    expect(rows.map((row) => row.status)).toEqual(["Decommissioned", null]);
  });

  it("never reads a status from a value that only looks like a key", () => {
    const { rows } = build([withCell(BIO_0417, "In Service", "constructor")]);

    expect(rows[0].status).toBeNull();
  });

  it("uses a constant status for every row", () => {
    const { rows } = build([BIO_0417, BIO_0852], {
      status: { kind: "constant", value: "Maintenance" },
    });

    expect(rows.map((row) => row.status)).toEqual([
      "Maintenance",
      "Maintenance",
    ]);
  });

  it("never fills a matching key from a constant", () => {
    const { rows } = build([BIO_0417, BIO_0852], {
      serialNumber: { kind: "constant", value: "SAME-FOR-ALL" },
    });

    expect(rows.map((row) => row.serialNumber)).toEqual([null, null]);
  });

  it("reads nothing from a mapped column the file does not have", () => {
    const { rows } = build([BIO_0417], { hostname: column("Host Name") });

    expect(rows[0].hostname).toBeNull();
  });
});
