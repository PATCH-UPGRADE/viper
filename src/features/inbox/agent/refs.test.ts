import { describe, expect, it } from "vitest";
import { buildEntityRefs, swapIdsForRefs } from "./refs";

describe("buildEntityRefs", () => {
  it("assigns 1-based ordinal refs per entity kind, in array order", () => {
    const refs = buildEntityRefs({
      vulnerabilityIds: ["cmv_a", "cmv_b"],
      remediationIds: ["cmr_a"],
      deviceGroupMatchingIds: ["cmg_a", "cmg_b", "cmg_c"],
    });
    expect(refs.vulnerabilityRefs).toEqual(["vuln-1", "vuln-2"]);
    expect(refs.remediationRefs).toEqual(["rem-1"]);
    expect(refs.deviceGroupMatchingRefs).toEqual([
      "group-1",
      "group-2",
      "group-3",
    ]);
    expect(refs.idByRef["vuln-2"]).toBe("cmv_b");
    expect(refs.refById.cmg_c).toBe("group-3");
  });

  it("swaps asset ids too, though assets are never linkable", () => {
    const refs = buildEntityRefs({
      vulnerabilityIds: [],
      remediationIds: [],
      deviceGroupMatchingIds: [],
      assetIds: ["cma_1", "cma_2"],
    });
    expect(refs.assetRefs).toEqual(["asset-1", "asset-2"]);
    expect(swapIdsForRefs("Asset pacs-syngo-03 (id: cma_2)", refs)).toBe(
      "Asset pacs-syngo-03 (id: asset-2)",
    );
  });

  it("swap-only vulnerability ids continue the vuln numbering but are not offered for linking", () => {
    const refs = buildEntityRefs({
      vulnerabilityIds: ["cmv_linked"],
      remediationIds: [],
      deviceGroupMatchingIds: [],
      swapOnlyVulnerabilityIds: ["cmv_linked", "cmv_target_only"],
    });
    expect(refs.vulnerabilityRefs).toEqual(["vuln-1"]);
    expect(refs.refById.cmv_linked).toBe("vuln-1");
    expect(refs.refById.cmv_target_only).toBe("vuln-2");
    expect(
      swapIdsForRefs("### Remediation rem-x → cmv_target_only", refs),
    ).toBe("### Remediation rem-x → vuln-2");
  });

  it("handles empty id lists", () => {
    const refs = buildEntityRefs({
      vulnerabilityIds: [],
      remediationIds: [],
      deviceGroupMatchingIds: [],
    });
    expect(refs.vulnerabilityRefs).toEqual([]);
    expect(Object.keys(refs.idByRef)).toEqual([]);
  });
});

describe("swapIdsForRefs", () => {
  it("replaces every occurrence of every known id, wherever it appears", () => {
    const refs = buildEntityRefs({
      vulnerabilityIds: ["cmabc123xyz"],
      remediationIds: ["cmrem456"],
      deviceGroupMatchingIds: ["cmdgm789"],
    });
    const md = [
      "### CVE-2024-1 (id: cmabc123xyz) — Medium",
      "### Remediation cmrem456 → CVE-2024-1",
      "- **Siemens / syngo.plaza** (id: cmdgm789) — 1 device group, 3 assets",
      "mentioned again: cmabc123xyz",
    ].join("\n");
    const out = swapIdsForRefs(md, refs);
    expect(out).not.toContain("cmabc123xyz");
    expect(out).not.toContain("cmrem456");
    expect(out).not.toContain("cmdgm789");
    expect(out).toContain("(id: vuln-1)");
    expect(out).toContain("### Remediation rem-1 → CVE-2024-1");
    expect(out).toContain("(id: group-1)");
    expect(out).toContain("mentioned again: vuln-1");
  });

  it("leaves markdown without known ids untouched", () => {
    const refs = buildEntityRefs({
      vulnerabilityIds: ["cmv"],
      remediationIds: [],
      deviceGroupMatchingIds: [],
    });
    expect(swapIdsForRefs("no ids here", refs)).toBe("no ids here");
  });
});
