// @vitest-environment node
import { describe, expect, it } from "vitest";
import { computeWeakSerials, normalizeSerial } from "../sync/serials";

describe("normalizeSerial", () => {
  it.each(["na", "", null, undefined])(
    "treats %s as no serial at all",
    (placeholder) => {
      expect(normalizeSerial(placeholder)).toBeNull();
    },
  );
});

describe("computeWeakSerials", () => {
  it("flags a serial that two records share", () => {
    const items = [
      { serialNumber: "100153" },
      { serialNumber: "100153" },
      { serialNumber: "63014" },
      { serialNumber: null },
    ];
    expect(computeWeakSerials(items)).toEqual(new Set(["100153"]));
  });
});
