// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseTlp } from "../tlp";

describe("parseTlp", () => {
  it("reads the marking the live feed sends", () => {
    expect(parseTlp("CLEAR")).toBe("CLEAR");
  });

  it("reads every TLP v1 and v2 value", () => {
    for (const value of ["WHITE", "GREEN", "AMBER", "RED", "CLEAR"]) {
      expect(parseTlp(value)).toBe(value);
    }
    expect(parseTlp("AMBER_STRICT")).toBe("AMBER_STRICT");
  });

  it("tolerates the TLP: prefix", () => {
    expect(parseTlp("TLP:AMBER")).toBe("AMBER");
    expect(parseTlp("TLP: RED")).toBe("RED");
  });

  it("tolerates a space or a plus where the enum has an underscore", () => {
    expect(parseTlp("AMBER STRICT")).toBe("AMBER_STRICT");
    expect(parseTlp("AMBER+STRICT")).toBe("AMBER_STRICT");
    expect(parseTlp("TLP:AMBER+STRICT")).toBe("AMBER_STRICT");
  });

  it("is case-insensitive", () => {
    expect(parseTlp("clear")).toBe("CLEAR");
  });

  // Undefined leaves the classifier's own reading in place, rather than
  // overriding it with a guess.
  it("returns undefined for a marking it does not recognise", () => {
    expect(parseTlp("PUCE")).toBeUndefined();
    expect(parseTlp("")).toBeUndefined();
    expect(parseTlp(null)).toBeUndefined();
    expect(parseTlp(undefined)).toBeUndefined();
  });
});
