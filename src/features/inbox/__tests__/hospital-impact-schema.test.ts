import { describe, expect, it } from "vitest";
import { hospitalImpactSchema } from "../types";

describe("hospitalImpactSchema", () => {
  it("accepts a fully-populated golden sample", () => {
    const golden = {
      byline:
        "An attacker on the imaging network could take full control of MRI, CT and reading workstations.",
      impactStatement:
        "If exploited, an unauthenticated attacker who can reach the affected ports gains remote code execution, putting scanner control and stored images at risk.",
      careAreas: "Radiology — MRI, CT, Reading Room",
      likelihood: "Unauthenticated network RCE · PoC exploit code exists",
    };
    expect(hospitalImpactSchema.safeParse(golden).success).toBe(true);
  });

  it("rejects the empty-object default {} so the UI hides the card", () => {
    expect(hospitalImpactSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a partial object missing required fields", () => {
    expect(hospitalImpactSchema.safeParse({ byline: "x" }).success).toBe(false);
  });

  it("accepts an empty careAreas string (degraded: no linked assets)", () => {
    const degraded = {
      byline: "Suspected phishing email flagged for security-team review.",
      impactStatement: "Unknown. Flagged for security team review.",
      careAreas: "",
      likelihood: "Unverified sender · possible phishing",
    };
    expect(hospitalImpactSchema.safeParse(degraded).success).toBe(true);
  });
});
