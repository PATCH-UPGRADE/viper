// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assetDashboardInclude, assetInclude } from "@/features/assets/types";
import { deviceArtifactInclude } from "@/features/device-artifacts/types";
import { remediationInclude } from "@/features/remediations/types";
import { ticketDetailInclude } from "@/features/tracking/types";
import {
  vulnerabilityByPriorityInclude,
  vulnerabilityInclude,
} from "@/features/vulnerabilities/types";
import { ResourceType } from "@/generated/prisma";
import { mappingPaths } from "../mapping-urls";

/**
 * The includes the app actually queries with. `mappingUrlExtension` is driven
 * entirely off these, so an include that stops matching stops resolving urls —
 * silently, and only in the UI. This is the guard against that.
 */
describe("every include that selects mappings still resolves", () => {
  // Each case lists the mapping paths its include selects, from the model root.
  const cases: [
    name: string,
    model: string,
    include: unknown,
    ResourceType,
    paths: string[][],
  ][] = [
    [
      "assetInclude",
      "Asset",
      assetInclude,
      ResourceType.Asset,
      [["externalMappings"]],
    ],
    [
      "assetDashboardInclude",
      "Asset",
      assetDashboardInclude,
      ResourceType.Asset,
      [["externalMappings"]],
    ],
    [
      "remediationInclude",
      "Remediation",
      remediationInclude,
      ResourceType.Remediation,
      [["externalMappings"]],
    ],
    [
      "deviceArtifactInclude",
      "DeviceArtifact",
      deviceArtifactInclude,
      ResourceType.DeviceArtifact,
      [["externalMappings"]],
    ],
    [
      "vulnerabilityInclude",
      "Vulnerability",
      vulnerabilityInclude,
      ResourceType.Vulnerability,
      // TODO: VW-540 drop the vulnerability-level path with the legacy mappings.
      [["records", "externalMappings"], ["externalMappings"]],
    ],
    [
      "vulnerabilityByPriorityInclude",
      "Vulnerability",
      vulnerabilityByPriorityInclude,
      ResourceType.Vulnerability,
      [["records", "externalMappings"]],
    ],
  ];

  for (const [name, model, include, resource, paths] of cases) {
    it(name, () => {
      expect(mappingPaths(model, { include })).toEqual(
        paths.map((path) => ({ path, resource })),
      );
    });
  }

  // Related tickets select their own external id for the row label, so the
  // walk finds those nested mappings too.
  it("ticketDetailInclude", () => {
    const resource = ResourceType.WorkOrder;
    expect(
      mappingPaths("WorkOrderTicket", { include: ticketDetailInclude }),
    ).toEqual([
      { path: ["externalMappings"], resource },
      { path: ["mitigationPlan", "workOrders", "externalMappings"], resource },
      { path: ["linksAsA", "ticketB", "externalMappings"], resource },
      { path: ["linksAsB", "ticketA", "externalMappings"], resource },
    ]);
  });
});
