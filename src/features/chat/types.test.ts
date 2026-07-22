// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseFleetProposal } from "./types";

// The shape the tool emits and the card renders from.
const PROPOSAL = {
  type: "fleet_work_order_proposal",
  assets: [
    {
      assetId: "rad-mri-001",
      hostname: "MR-MAGNETOM-001",
      equipmentKey: "US_1064669350",
    },
  ],
  summary: "Firmware update: MRI-001 (vendor-recommended maintenance)",
  description: "Vendor-recommended firmware update for the MAGNETOM scanner.",
  category: "FIRMWARE_UPDATE",
  scheduledAt: null,
  rationale: "Schedule during the lowest utilization window.",
};

describe("parseFleetProposal", () => {
  it("accepts an already-parsed object (the stream bridge parses tool output)", () => {
    // Regression: part.output arrives as an object, not a string, because
    // normalizeToolOutput JSON.parses it before it reaches the UI.
    const parsed = parseFleetProposal(PROPOSAL);
    expect(parsed?.assets[0].equipmentKey).toBe("US_1064669350");
  });

  it("accepts a JSON string too", () => {
    const parsed = parseFleetProposal(JSON.stringify(PROPOSAL));
    expect(parsed?.summary).toContain("Firmware update");
  });

  it("returns null for a rejection string so no card renders", () => {
    expect(
      parseFleetProposal("REJECTED: Not managed by Siemens Healthineers"),
    ).toBeNull();
  });

  it("returns null for a non-proposal object or nullish output", () => {
    expect(parseFleetProposal({ foo: "bar" })).toBeNull();
    expect(parseFleetProposal(null)).toBeNull();
    expect(parseFleetProposal(undefined)).toBeNull();
  });
});
