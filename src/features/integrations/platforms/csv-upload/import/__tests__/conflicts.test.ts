import { describe, expect, it } from "vitest";
import type { MatchKeysRow } from "../../contract";
import { findInFileConflicts } from "../conflicts";

const keysRow = (overrides: Partial<MatchKeysRow>): MatchKeysRow => ({
  rowNumber: 2,
  manufacturer: "Philips",
  product: "IntelliVue MX800",
  serialNumber: null,
  macAddress: null,
  hostname: null,
  ...overrides,
});

describe("findInFileConflicts", () => {
  it("finds nothing wrong with a clean file", () => {
    const conflicts = findInFileConflicts([
      keysRow({ rowNumber: 2, serialNumber: "P-518204" }),
      keysRow({ rowNumber: 3, serialNumber: "P-518205" }),
    ]);

    expect(conflicts.size).toBe(0);
  });

  it("fails the later of two rows that share a MAC address", () => {
    const conflicts = findInFileConflicts([
      keysRow({ rowNumber: 5, macAddress: "00:1A:2B:3C:4D:5E" }),
      keysRow({ rowNumber: 9, macAddress: "00:1A:2B:3C:4D:5E" }),
    ]);

    expect(conflicts.get(9)).toBe(
      "MAC address also used by row 5 in this file",
    );
  });

  it("points every repeat at the first row that used the serial", () => {
    const conflicts = findInFileConflicts([
      keysRow({ rowNumber: 2, serialNumber: "100153" }),
      keysRow({ rowNumber: 3, serialNumber: "100153" }),
      keysRow({ rowNumber: 4, serialNumber: "100153" }),
    ]);

    expect(conflicts.has(2)).toBe(false);
    expect(conflicts.get(3)).toBe("Serial also used by row 2 in this file");
    expect(conflicts.get(4)).toBe("Serial also used by row 2 in this file");
  });

  it("lets a row that fails for a missing model still claim its serial", () => {
    const conflicts = findInFileConflicts([
      keysRow({ rowNumber: 2, product: null, serialNumber: "P-1" }),
      keysRow({ rowNumber: 3, serialNumber: "P-1" }),
    ]);

    expect(conflicts.get(2)).toBe("Model is missing");
    expect(conflicts.get(3)).toBe("Serial also used by row 2 in this file");
  });

  it("reports a missing name before a repeated serial", () => {
    const conflicts = findInFileConflicts([
      keysRow({ rowNumber: 2, serialNumber: "P-1" }),
      keysRow({ rowNumber: 3, manufacturer: null, serialNumber: "P-1" }),
    ]);

    expect(conflicts.get(3)).toBe("Manufacturer is missing");
  });

  it("does not treat a repeated hostname as a conflict", () => {
    const conflicts = findInFileConflicts([
      keysRow({ rowNumber: 2, hostname: "ws-icu-01" }),
      keysRow({ rowNumber: 3, hostname: "ws-icu-01" }),
    ]);

    expect(conflicts.size).toBe(0);
  });
});
