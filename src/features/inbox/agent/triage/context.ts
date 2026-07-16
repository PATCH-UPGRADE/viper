import "server-only";
import { getRelevantNotes } from "@/features/notes/server/get-relevant-notes";
import prisma from "@/lib/db";
import {
  deviceGroupWhereForMatching,
  type MatchingLike,
  matchingAppliesToDeviceGroup,
} from "@/lib/device-matching";
import {
  deviceGroupLabel,
  deviceGroupMatchingLabel,
  type NoteTargetLabels,
  parseLocation,
  type RemediationForMarkdown,
  remediationToMarkdown,
  renderNoteTarget,
  renderUtilization,
  type VulnerabilityForMarkdown,
  vulnerabilityToMarkdown,
  workflowClinicalSummary,
} from "@/lib/markdown";

export type TriageContext = {
  notificationId: string;
  markdown: string;
  affectedAssetIds: string[];
};

// Unlike the VEX agent's gatherVexContext, this unions notification- and
// vulnerability-level matchings and never returns null, so notifications
// without linked vulns/assets still triage on a degraded context.
export async function gatherTriageContext(
  notificationId: string,
): Promise<TriageContext> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      deviceGroupsMatchings: {
        include: {
          deviceGroupMatching: {
            include: { vendor: true, product: true, version: true },
          },
        },
      },
      vulnerabilities: {
        include: {
          vulnerability: {
            include: {
              deviceGroupMatchings: {
                include: { vendor: true, product: true, version: true },
              },
              remediations: {
                include: {
                  deviceGroupMatchings: {
                    include: { vendor: true, product: true, version: true },
                  },
                  vulnerability: { select: { id: true, cveId: true } },
                },
              },
              issues: true,
            },
          },
        },
      },
      remediations: {
        include: {
          remediation: {
            include: {
              deviceGroupMatchings: {
                include: { vendor: true, product: true, version: true },
              },
              vulnerability: { select: { id: true, cveId: true } },
            },
          },
        },
      },
    },
  });

  if (!notification) {
    return { notificationId, markdown: "", affectedAssetIds: [] };
  }

  const vulnerabilities = notification.vulnerabilities.map(
    (m) => m.vulnerability,
  );
  const remediationsById = new Map<
    string,
    (typeof notification.remediations)[number]["remediation"]
  >();
  for (const m of notification.remediations) {
    remediationsById.set(m.remediation.id, m.remediation);
  }
  for (const v of vulnerabilities) {
    for (const r of v.remediations) remediationsById.set(r.id, r);
  }
  const remediations = [...remediationsById.values()];

  const matchingsById = new Map<
    string,
    (typeof notification.deviceGroupsMatchings)[number]["deviceGroupMatching"]
  >();
  for (const m of notification.deviceGroupsMatchings) {
    if (m.confidence === "Rejected") continue;
    matchingsById.set(m.deviceGroupMatching.id, m.deviceGroupMatching);
  }
  for (const v of vulnerabilities) {
    for (const dgm of v.deviceGroupMatchings) matchingsById.set(dgm.id, dgm);
  }
  const matchings = [...matchingsById.values()];

  const candidateGroups =
    matchings.length > 0
      ? await prisma.deviceGroup.findMany({
          where: { OR: matchings.map(deviceGroupWhereForMatching) },
          include: {
            vendor: true,
            product: true,
            version: true,
            assets: true,
          },
        })
      : [];

  const groups = candidateGroups.filter((g) =>
    matchings.some((m: MatchingLike) => matchingAppliesToDeviceGroup(m, g)),
  );

  const seenAssets = new Set<string>();
  const affectedAssets: AffectedAsset[] = [];
  for (const g of groups) {
    const label = deviceGroupLabel(g);
    for (const asset of g.assets) {
      if (seenAssets.has(asset.id)) continue;
      seenAssets.add(asset.id);
      affectedAssets.push({ asset, groupLabel: label });
    }
  }
  const affectedAssetIds = [...seenAssets];

  const notes = await getRelevantNotes({
    vulnerabilityIds: vulnerabilities.map((v) => v.id),
    remediationIds: remediations.map((r) => r.id),
    deviceGroupMatchingIds: matchings.map((m) => m.id),
    assetIds: affectedAssetIds,
  });

  const workflows =
    affectedAssetIds.length > 0
      ? await prisma.workflow.findMany({
          include: { nodes: true, connections: true },
        })
      : [];

  const noteLabels: NoteTargetLabels = {
    assetLabel: new Map(
      affectedAssets.map(({ asset }) => [
        asset.id,
        asset.hostname ?? asset.ip ?? asset.id,
      ]),
    ),
    groupLabel: new Map(groups.map((g) => [g.id, deviceGroupLabel(g)])),
    matchingLabel: new Map(
      matchings.map((m) => [m.id, deviceGroupMatchingLabel(m)]),
    ),
    cveById: new Map(vulnerabilities.map((v) => [v.id, v.cveId ?? v.id])),
  };

  const vulnInputs: VulnerabilityForMarkdown[] = vulnerabilities.map((v) => ({
    id: v.id,
    cveId: v.cveId,
    severity: v.severity,
    priority: v.priority,
    cvssScore: v.cvssScore,
    cvssVector: v.cvssVector,
    epss: v.epss,
    inKEV: v.inKEV,
    affectedComponents: v.affectedComponents,
    description: v.description,
    narrative: v.narrative,
    impact: v.impact,
    deviceGroupMatchings: v.deviceGroupMatchings,
  }));

  const vexIssues: VexIssue[] = vulnerabilities.flatMap((v) =>
    v.issues.map((i) => ({
      cve: v.cveId ?? v.id,
      status: i.status,
      notAffectedJustification: i.notAffectedJustification,
      statusConfidence: i.statusConfidence,
      deviceGroupMatchingId: i.deviceGroupMatchingId,
      assetId: i.assetId,
    })),
  );

  const markdown = renderTriagePrompt({
    vulnerabilities: vulnInputs,
    vexIssues,
    remediations,
    groups,
    affectedAssets,
    notes,
    noteLabels,
    workflowsMarkdown:
      affectedAssetIds.length > 0
        ? workflowClinicalSummary(workflows, affectedAssetIds)
        : null,
  });

  return { notificationId, markdown, affectedAssetIds };
}

type AffectedAsset = {
  asset: {
    id: string;
    hostname: string | null;
    ip: string;
    role: string | null;
    location: unknown;
    utilization: unknown;
  };
  groupLabel: string;
};

type VexIssue = {
  cve: string;
  status: string;
  notAffectedJustification: string | null;
  statusConfidence: string | null;
  deviceGroupMatchingId: string | null;
  assetId: string | null;
};

type GroupForRender = {
  vendor?: { canonicalDisplayName: string } | null;
  product?: { canonicalDisplayName: string } | null;
  version?: { canonicalDisplayName: string } | null;
  cpe?: string[];
  assets: unknown[];
};

type RenderArgs = {
  vulnerabilities: VulnerabilityForMarkdown[];
  vexIssues: VexIssue[];
  remediations: RemediationForMarkdown[];
  groups: GroupForRender[];
  affectedAssets: AffectedAsset[];
  notes: Array<{
    text: string;
    status: string;
    targetModel: string | null;
    instanceId: string | null;
  }>;
  noteLabels: NoteTargetLabels;
  workflowsMarkdown: string | null;
};

function renderTriagePrompt(args: RenderArgs): string {
  const sections: string[] = [];

  if (args.vulnerabilities.length > 0) {
    sections.push(
      "## Linked vulnerabilities\n\n" +
        args.vulnerabilities
          .map((v) =>
            vulnerabilityToMarkdown(v, {
              includeAssets: false,
              includeRemediations: false,
            }),
          )
          .join("\n\n"),
    );
  }

  if (args.vexIssues.length > 0) {
    sections.push(
      "## VEX determinations (already sorted for this notification)\n\n" +
        args.vexIssues
          .map((i) => {
            const scope = i.assetId
              ? `asset ${i.assetId}`
              : i.deviceGroupMatchingId
                ? `device group ${args.noteLabels.matchingLabel.get(i.deviceGroupMatchingId) ?? i.deviceGroupMatchingId}`
                : "unscoped";
            const just = i.notAffectedJustification
              ? ` (${i.notAffectedJustification})`
              : "";
            const conf = i.statusConfidence
              ? ` [confidence: ${i.statusConfidence}]`
              : "";
            return `- ${i.cve} — **${i.status}**${just}${conf} — ${scope}`;
          })
          .join("\n"),
    );
  }

  if (args.remediations.length > 0) {
    sections.push(
      "## Linked remediations\n\n" +
        args.remediations.map(remediationToMarkdown).join("\n\n"),
    );
  }

  if (args.groups.length > 0) {
    sections.push(
      "## Affected device groups\n\n" +
        args.groups
          .map(
            (g) =>
              `- **${deviceGroupLabel(g)}** — ${g.assets.length} asset${g.assets.length === 1 ? "" : "s"}`,
          )
          .join("\n"),
    );
  }

  if (args.affectedAssets.length > 0) {
    const careLines = [
      ...new Set(
        args.affectedAssets.map(({ asset, groupLabel }) => {
          const loc = parseLocation(asset.location);
          const role = asset.role ?? "unknown role";
          return `- ${groupLabel} — ${role} @ ${loc}`;
        }),
      ),
    ];
    sections.push(
      "## Care areas (affected locations & device types)\n\n" +
        careLines.join("\n"),
    );
  }

  const utilLines = args.affectedAssets
    .map(({ asset }) => {
      const rendered = renderUtilization(asset.utilization);
      if (!rendered) return null;
      const label = asset.hostname ?? asset.ip ?? asset.id;
      return `- **${label}**: ${rendered}`;
    })
    .filter((line): line is string => line !== null);
  if (utilLines.length > 0) {
    sections.push(`## Device utilization\n\n${utilLines.join("\n")}`);
  }

  if (args.workflowsMarkdown) {
    sections.push(`## Clinical workflows\n\n${args.workflowsMarkdown}`);
  }

  if (args.notes.length > 0) {
    sections.push(
      "## Notes (evidence)\n\n" +
        args.notes
          .map(
            (n) => `- **${renderNoteTarget(n, args.noteLabels)}**: ${n.text}`,
          )
          .join("\n"),
    );
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : "_No additional hospital context resolved for this notification._";
}
