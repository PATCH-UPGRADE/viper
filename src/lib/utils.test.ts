// @vitest-environment node
import { describe, expect, it } from "vitest";
import { firstNameOf, seenBySummary } from "./utils";

describe("firstNameOf", () => {
  it("takes the leading word of a full name", () => {
    expect(firstNameOf("Mark Hayter")).toBe("Mark");
    expect(firstNameOf("Ada B. Lovelace")).toBe("Ada");
  });

  it("returns the whole string when there is nothing to split on", () => {
    expect(firstNameOf("Mark")).toBe("Mark");
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(firstNameOf("   Mark   Hayter ")).toBe("Mark");
  });

  it("returns null rather than an empty string", () => {
    // Callers choose their own fallback wording; "brief for " reads as a bug.
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
  });
});

describe("seenBySummary", () => {
  const viewer = (name: string | null) => ({ name });

  it("says nobody has seen it when there are no viewers", () => {
    expect(seenBySummary([])).toBe("Not seen yet");
  });

  it("names up to three viewers in the order given", () => {
    expect(seenBySummary([viewer("Priya Raman"), viewer("Gabe Ortiz")])).toBe(
      "Seen by Priya Raman and Gabe Ortiz",
    );
  });

  it("collapses the rest into a count", () => {
    expect(
      seenBySummary([
        viewer("Priya Raman"),
        viewer("Gabe Ortiz"),
        viewer("Elena Marsh"),
        viewer("Sam Lee"),
        viewer("Tom Ng"),
      ]),
    ).toBe("Seen by Priya Raman, Gabe Ortiz, Elena Marsh and 2 others");
  });

  it("falls back to 'someone' for a viewer without a name", () => {
    expect(seenBySummary([viewer(null)])).toBe("Seen by someone");
  });
});
