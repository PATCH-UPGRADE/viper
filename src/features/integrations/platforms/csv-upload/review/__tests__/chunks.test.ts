import { describe, expect, it } from "vitest";
import { MAX_REQUEST_BYTES } from "../../contract";
import { chunkBySize, jsonByteLength, REQUEST_ENVELOPE_BYTES } from "../chunks";

const row = (rowNumber: number, serialNumber: string) => ({
  rowNumber,
  serialNumber,
});

describe("chunkBySize", () => {
  it("starts a new chunk before the measured size would pass the limit", () => {
    const items = [row(2, "A"), row(3, "B"), row(4, "C")];
    const roomForTwo = (jsonByteLength(items[0]) + 1) * 2;
    expect(chunkBySize(items, roomForTwo)).toEqual([
      [items[0], items[1]],
      [items[2]],
    ]);
  });

  it("never splits an item that is bigger than the limit on its own", () => {
    const oversized = row(2, "x".repeat(100));
    expect(chunkBySize([oversized, row(3, "B")], 10)).toEqual([
      [oversized],
      [row(3, "B")],
    ]);
  });

  it("measures bytes, not characters", () => {
    expect(jsonByteLength("é")).toBe(4);
  });

  it("leaves room for the request envelope under the request limit by default", () => {
    const rowOfOneKilobyte = { raw: "x".repeat(1_000) };
    const chunks = chunkBySize(Array(5_000).fill(rowOfOneKilobyte));
    const largestChunkBytes = Math.max(...chunks.map(jsonByteLength));
    expect(largestChunkBytes).toBeLessThanOrEqual(
      MAX_REQUEST_BYTES - REQUEST_ENVELOPE_BYTES,
    );
  });

  it("returns no chunks for no items", () => {
    expect(chunkBySize([], 10)).toEqual([]);
  });
});
