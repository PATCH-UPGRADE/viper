// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseWorkOrderProposal } from "../schemas";

// The shape the tool emits and the card renders from.
const PROPOSAL = {
  type: "work_order_proposal",
  ticketId: "wo-1",
  summary: "Firmware update: MRI-001 (vendor-recommended maintenance)",
  description: "Vendor-recommended firmware update for the MAGNETOM scanner.",
  category: "FIRMWARE_UPDATE",
  scheduledAt: null,
  rationale: "Schedule during the lowest utilization window.",
  target: {
    integrationId: "int-1",
    integrationName: "teamplay Fleet",
    managedBy: "Siemens Healthineers",
  },
  assets: [{ id: "rad-mri-001", label: "MR-MAGNETOM-001" }],
  platformPayload: {
    supportType: "application",
    operationalStatus: "partially_operational",
    dangerForPatient: "no",
    overtimeAuthorized: false,
  },
};

describe("parseWorkOrderProposal", () => {
  it("accepts an already-parsed object (the stream bridge parses tool output)", () => {
    // Regression: part.output arrives as an object, not a string, because
    // normalizeToolOutput JSON.parses it before it reaches the UI.
    const parsed = parseWorkOrderProposal(PROPOSAL);
    expect(parsed?.ticketId).toBe("wo-1");
    expect(parsed?.assets[0].label).toBe("MR-MAGNETOM-001");
  });

  it("accepts a JSON string too", () => {
    const parsed = parseWorkOrderProposal(JSON.stringify(PROPOSAL));
    expect(parsed?.summary).toContain("Firmware update");
  });

  it("returns null for a rejection string so no card renders", () => {
    expect(
      parseWorkOrderProposal("REJECTED: No platform files for those assets"),
    ).toBeNull();
  });

  it("returns null for a non-proposal object or nullish output", () => {
    expect(parseWorkOrderProposal({ foo: "bar" })).toBeNull();
    expect(parseWorkOrderProposal(null)).toBeNull();
    expect(parseWorkOrderProposal(undefined)).toBeNull();
  });
});
