// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assetDashboardInclude, assetInclude } from "@/features/assets/types";
import { deviceArtifactInclude } from "@/features/device-artifacts/types";
import { notificationDetailInclude } from "@/features/inbox/types";
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
  const cases: [name: string, model: string, include: unknown, ResourceType][] =
    [
      ["assetInclude", "Asset", assetInclude, ResourceType.Asset],
      [
        "assetDashboardInclude",
        "Asset",
        assetDashboardInclude,
        ResourceType.Asset,
      ],
      [
        "remediationInclude",
        "Remediation",
        remediationInclude,
        ResourceType.Remediation,
      ],
      [
        "deviceArtifactInclude",
        "DeviceArtifact",
        deviceArtifactInclude,
        ResourceType.DeviceArtifact,
      ],
      [
        "vulnerabilityInclude",
        "Vulnerability",
        vulnerabilityInclude,
        ResourceType.Vulnerability,
      ],
      [
        "vulnerabilityByPriorityInclude",
        "Vulnerability",
        vulnerabilityByPriorityInclude,
        ResourceType.Vulnerability,
      ],
      [
        "ticketDetailInclude",
        "WorkOrderTicket",
        ticketDetailInclude,
        ResourceType.WorkOrder,
      ],
    ];

  for (const [name, model, include, resource] of cases) {
    it(name, () => {
      expect(mappingPaths(model, { include })).toEqual([
        { path: ["externalMappings"], resource },
      ]);
    });
  }
});
