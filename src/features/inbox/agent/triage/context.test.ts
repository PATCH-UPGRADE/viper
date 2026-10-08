// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

const { careAreaGroupLabel, renderTriagePrompt } = await import("./context");

type Args = Parameters<typeof renderTriagePrompt>[0];
type Affected = Args["affectedAssets"][number];

const affected = (role: string | null, location: unknown): Affected => ({
  asset: {
    id: "asset-1",
    hostname: "PUMP-SIGMA-001",
    ip: null,
    role,
    location,
    utilization: null,
  },
  groupLabel: "Baxter Sigma Spectrum (Infusion Pump)",
});

const render = (affectedAssets: Affected[]) =>
  renderTriagePrompt({
    vulnerabilities: [],
    vexIssues: [],
    remediations: [],
    groups: [],
    matchingSummaries: [],
    includeIds: false,
    affectedAssets,
    notes: [],
    noteLabels: {
      assetLabel: new Map(),
      groupLabel: new Map(),
      matchingLabel: new Map(),
      cveById: new Map(),
    },
    workflowsMarkdown: null,
  });

describe("careAreaGroupLabel", () => {
  const group = {
    manufacturer: { canonicalDisplayName: "Baxter" },
    product: {
      canonicalDisplayName: "Sigma Spectrum",
      deviceType: { displayName: "Infusion Pump" },
    },
  };

  it("adds the product's device type to the group label", () => {
    expect(careAreaGroupLabel(group)).toBe(
      "Baxter Sigma Spectrum (Infusion Pump)",
    );
  });

  it("leaves out a missing device type", () => {
    expect(
      careAreaGroupLabel({
        ...group,
        product: { ...group.product, deviceType: null },
      }),
    ).toBe("Baxter Sigma Spectrum");
  });
});

describe("renderTriagePrompt care areas", () => {
  it("gives the group label, the asset's role, and the location", () => {
    expect(
      render([
        affected("ICU Bay Pump", {
          facility: "Main",
          building: "Medical-Surgical Unit",
        }),
      ]),
    ).toContain(
      "## Care areas (affected locations & device types)\n\n" +
        "- Baxter Sigma Spectrum (Infusion Pump) — ICU Bay Pump @ Main / Medical-Surgical Unit",
    );
  });

  it("leaves out a missing role or location", () => {
    const prompt = render([affected(null, {})]);

    expect(prompt).toMatch(/^- Baxter Sigma Spectrum \(Infusion Pump\)$/m);
    expect(prompt).not.toContain("unknown role");
  });
});
