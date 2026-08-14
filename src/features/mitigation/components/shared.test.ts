// @vitest-environment node
import { describe, expect, it } from "vitest";
import { residualRiskTone } from "./shared";

describe("residualRiskTone", () => {
  it("reads a bare level", () => {
    expect(residualRiskTone("Low")).toBe("low");
    expect(residualRiskTone("Medium")).toBe("medium");
    expect(residualRiskTone("High")).toBe("high");
  });

  it("reads a level qualified by a clause", () => {
    expect(residualRiskTone("High until patched")).toBe("high");
    expect(residualRiskTone("Low once the segment is in place")).toBe("low");
  });

  it("prefers the more severe level when a phrase names two", () => {
    expect(residualRiskTone("Low now, high if the patch slips")).toBe("high");
  });

  it("accepts synonyms the model reaches for", () => {
    expect(residualRiskTone("Critical")).toBe("high");
    expect(residualRiskTone("Moderate")).toBe("medium");
    expect(residualRiskTone("Minimal")).toBe("low");
  });

  it("falls back to unknown for prose it cannot read", () => {
    expect(residualRiskTone("Uncertain")).toBe("unknown");
    expect(residualRiskTone(undefined)).toBe("unknown");
    expect(residualRiskTone("")).toBe("unknown");
  });

  it("does not match a level inside a longer word", () => {
    expect(residualRiskTone("Highlighted for review")).toBe("unknown");
  });
});
