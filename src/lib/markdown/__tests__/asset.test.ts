import { describe, expect, it } from "vitest";
import { assetToMarkdown } from "../asset";

type AssetArg = Parameters<typeof assetToMarkdown>[0];

const asset = (overrides: Partial<AssetArg> = {}): AssetArg => ({
  id: "asset-1",
  hostname: "PUMP-SIGMA-001",
  role: "ICU Bay Pump",
  manufacturer: { canonicalDisplayName: "Baxter" },
  product: {
    canonicalDisplayName: "Sigma Spectrum",
    deviceType: { displayName: "Infusion Pump" },
  },
  ...overrides,
});

describe("assetToMarkdown", () => {
  it("gives the agent both the device type and the role", () => {
    const md = assetToMarkdown(asset(), { includeIssues: false });

    expect(md).toContain(
      "- **Device Type**: Infusion Pump\n- **Role**: ICU Bay Pump",
    );
  });

  it.each([
    [
      "a product with no device type",
      { product: { canonicalDisplayName: "OptiPlex 790", deviceType: null } },
    ],
    ["no product", { product: null }],
  ])("says Unknown for %s", (_, overrides) => {
    expect(
      assetToMarkdown(asset(overrides), { includeIssues: false }),
    ).toContain("- **Device Type**: Unknown");
  });

  it("names the device and its version", () => {
    const md = assetToMarkdown(
      asset({ version: { canonicalDisplayName: "8.3" } }),
      { includeIssues: false },
    );

    expect(md).toContain(
      "- **Device**: Baxter Sigma Spectrum\n- **Version**: 8.3",
    );
  });
});
