import { describe, expect, it } from "vitest";
import { workflowClinicalSummary } from "../workflow";

type WorkflowArg = Parameters<typeof workflowClinicalSummary>[0][number];

function makeWorkflow(
  id: string,
  name: string,
  nodes: Array<{
    id: string;
    type: string;
    name?: string;
    data?: Record<string, unknown>;
    // Linked asset / device-group-matching ids now live in relations, which
    // serializeWorkflow surfaces into node.data.
    assetIds?: string[];
    deviceGroupMatchingIds?: string[];
  }>,
): WorkflowArg {
  return {
    id,
    name,
    description: `${name} description`,
    userId: "user_1",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    nodes: nodes.map((n) => ({
      id: n.id,
      workflowId: id,
      name: n.name ?? n.id,
      type: n.type,
      position: {},
      data: n.data ?? {},
      createdAt: new Date(0),
      updatedAt: new Date(0),
      assets: (n.assetIds ?? []).map((assetId) => ({ id: assetId })),
      deviceGroupMatchings: (n.deviceGroupMatchingIds ?? []).map((dgmId) => ({
        id: dgmId,
      })),
    })),
    connections: [],
  } as unknown as WorkflowArg;
}

describe("workflowClinicalSummary", () => {
  const imaging = makeWorkflow("wf_imaging", "Emergency CT Protocol", [
    { id: "n1", type: "STEP", data: { label: "Patient arrives" } },
    {
      id: "n2",
      type: "ASSET",
      name: "CT Scanner",
      data: { label: "CT Scanner" },
      assetIds: ["asset_ct", "asset_pacs"],
    },
  ]);

  const pharmacy = makeWorkflow("wf_pharmacy", "Medication Dispensing", [
    {
      id: "n3",
      type: "ASSET",
      name: "Pyxis Cabinet",
      assetIds: ["asset_pyxis"],
    },
  ]);

  // Links a class of devices via a device-group matching rather than a
  // specific asset id.
  const radiology = makeWorkflow("wf_radiology", "Radiology Imaging", [
    {
      id: "n4",
      type: "ASSET",
      name: "Imaging Device",
      deviceGroupMatchingIds: ["dgm_ge_imaging"],
    },
  ]);

  it("includes only workflows whose ASSET nodes reference an affected asset", () => {
    const md = workflowClinicalSummary([imaging, pharmacy], ["asset_ct"]);
    expect(md).toContain("Emergency CT Protocol");
    expect(md).toContain("CT Scanner"); // the affected step
    expect(md).not.toContain("Medication Dispensing");
  });

  it("matches ASSET nodes linked via a device-group matching", () => {
    const md = workflowClinicalSummary(
      [imaging, radiology],
      ["asset_ct"],
      ["dgm_ge_imaging"],
    );
    expect(md).toContain("Radiology Imaging");
    expect(md).toContain("Imaging Device"); // matched by device-group matching
  });

  it("reports when no workflow includes the affected assets", () => {
    const md = workflowClinicalSummary([imaging, pharmacy], ["asset_unknown"]);
    expect(md).toBe(
      "_No clinical workflows include the affected assets or device groups._",
    );
  });

  it("degrades gracefully when there are no affected assets", () => {
    const md = workflowClinicalSummary([imaging, pharmacy], []);
    expect(md).toBe(
      "_No affected assets or device groups to map to clinical workflows._",
    );
  });

  it("ignores STEP nodes when matching assets", () => {
    // asset id only appears on a STEP node → must not match.
    const stepOnly = makeWorkflow("wf_step", "Step Only", [
      { id: "s1", type: "STEP", assetIds: ["asset_ct"] },
    ]);
    const md = workflowClinicalSummary([stepOnly], ["asset_ct"]);
    expect(md).toBe(
      "_No clinical workflows include the affected assets or device groups._",
    );
  });
});
