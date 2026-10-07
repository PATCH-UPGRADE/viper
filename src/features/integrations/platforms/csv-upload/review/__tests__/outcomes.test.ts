import { describe, expect, it } from "vitest";
import { alreadyLinkedReason, summarizeOutcomes } from "../outcomes";

describe("summarizeOutcomes", () => {
  it("counts added and linked rows and keeps the server's failure reasons", () => {
    const summary = summarizeOutcomes(
      [
        { kind: "add", rowNumber: 2 },
        { kind: "link", rowNumber: 3, assetId: "asset-1" },
        { kind: "fail", rowNumber: 4, reason: "Model is missing" },
      ],
      new Map(),
    );
    expect(summary).toEqual({
      addedRowNumbers: [2],
      linkedAssetIds: ["asset-1"],
      failures: [{ rowNumber: 4, reason: "Model is missing" }],
    });
  });

  it("fails a row that repeats a serial earlier in the file", () => {
    const summary = summarizeOutcomes(
      [{ kind: "add", rowNumber: 214 }],
      new Map([[214, "Serial also used by row 88 in this file"]]),
    );
    expect(summary.addedRowNumbers).toEqual([]);
    expect(summary.failures).toEqual([
      { rowNumber: 214, reason: "Serial also used by row 88 in this file" },
    ]);
  });

  it("fails the later of two rows that link to the same device, across chunks", () => {
    const summary = summarizeOutcomes(
      [
        { kind: "link", rowNumber: 900, assetId: "asset-1" },
        { kind: "link", rowNumber: 5, assetId: "asset-1" },
      ],
      new Map(),
    );
    expect(summary.linkedAssetIds).toEqual(["asset-1"]);
    expect(summary.failures).toEqual([
      { rowNumber: 900, reason: "Row 5 already links to this device" },
    ]);
    expect(alreadyLinkedReason(5)).toBe("Row 5 already links to this device");
  });
});
