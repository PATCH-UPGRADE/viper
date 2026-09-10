// @vitest-environment node
import { describe, expect, it } from "vitest";
import { firstNameOf } from "./utils";

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
