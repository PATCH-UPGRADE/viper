// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildColumnMappingSchema, toSuggestedFields } from "./schema";

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

const schema = buildColumnMappingSchema(headers);

const unmapped = { header: null, confidence: "NeedsReview" } as const;
const matched = (header: string) =>
  ({ header, confidence: "Matched" }) as const;

const goldenFields = {
  role: matched("Device Description"),
  manufacturer: matched("Mfr"),
  product: matched("Model"),
  version: matched("SW Rev"),
  serialNumber: matched("Serial No"),
  ip: matched("IP Address"),
  macAddress: matched("MAC"),
  hostname: unmapped,
  networkSegment: unmapped,
  status: { header: "In Service", confidence: "NeedsReview" },
  facility: unmapped,
  building: matched("Bldg"),
  floor: unmapped,
  room: matched("Room"),
} as const;

describe("column mapping schema", () => {
  it("accepts a file where no column can be mapped", () => {
    const nothingMapped = Object.fromEntries(
      Object.keys(goldenFields).map((field) => [field, unmapped]),
    );
    expect(schema.safeParse({ fields: nothingMapped }).success).toBe(true);
  });

  it("rejects Confirmed, which only a person may give", () => {
    expect(
      schema.safeParse({
        fields: {
          ...goldenFields,
          manufacturer: { header: "Mfr", confidence: "Confirmed" },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a column that is not in the file", () => {
    expect(
      schema.safeParse({
        fields: { ...goldenFields, serialNumber: matched("Serial Number") },
      }).success,
    ).toBe(false);
  });

  it("rejects an answer that leaves a field out", () => {
    const { room: _room, ...withoutRoom } = goldenFields;
    expect(schema.safeParse({ fields: withoutRoom }).success).toBe(false);
  });
});

describe("toSuggestedFields", () => {
  it("keeps every mapped field with its confidence and drops the unmapped ones", () => {
    const suggested = toSuggestedFields(schema.parse({ fields: goldenFields }));

    expect(suggested.manufacturer).toEqual({
      header: "Mfr",
      confidence: "Matched",
    });
    expect(suggested.status).toEqual({
      header: "In Service",
      confidence: "NeedsReview",
    });
    expect(suggested.hostname).toBeUndefined();
    expect(Object.keys(suggested)).toHaveLength(10);
  });

  it("never maps one column to two fields that identify the device", () => {
    const suggested = toSuggestedFields(
      schema.parse({
        fields: { ...goldenFields, hostname: matched("Serial No") },
      }),
    );

    expect(suggested.serialNumber).toBeUndefined();
    expect(suggested.hostname).toBeUndefined();
    expect(suggested.manufacturer).toEqual(matched("Mfr"));
  });

  it("allows one column for two fields that do not identify the device", () => {
    const suggested = toSuggestedFields(
      schema.parse({
        fields: { ...goldenFields, room: matched("Bldg") },
      }),
    );

    expect(suggested.building).toEqual(matched("Bldg"));
    expect(suggested.room).toEqual(matched("Bldg"));
  });
});
