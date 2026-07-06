// VEX sorting agent context: gathers everything the agent needs for a
// notification (sources, vulns, remediations, device groups, notes, baseline
// issues) and renders it to a single markdown prompt. Deterministic (no LLM);
// separated so gather + render can be inspected independently of the model call.

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
  deviceGroupToMarkdown,
} from "@/lib/string-utils";

/** A baseline (device-group-matching-level) issue the agent may refine. */
export type VexIssueContext = {
  issueId: string;
  vulnerabilityId: string;
  /** Asset ids reachable through this issue's matching — valid targets for overrides. */
  assetIds: string[];
};

export type VexContext = {
  notificationId: string;
  /** Full markdown prompt describing sources, vulns, remediations, groups, notes, issues. */
  markdown: string;
  /** Baseline issues in scope, in the order rendered. */
  issues: VexIssueContext[];
};

type MatchingWithRefs = MatchingLike & {
  id: string;
  vendor?: { canonicalDisplayName: string } | null;
  product?: { canonicalDisplayName: string } | null;
  version?: { canonicalDisplayName: string } | null;
};

/**
 * Gather everything the VEX agent needs for a notification and render it to a
 * single markdown prompt. Deterministic (no LLM); separated so gather + render
 * can be inspected independently of the model call.
 */
export async function gatherVexContext(
  notificationId: string,
): Promise<VexContext | null> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      sources: { select: { markdown: true, channel: true } },
      vulnerabilities: {
        include: {
          vulnerability: {
            include: {
              deviceGroupMatchings: {
                include: {
                  vendor: { select: { canonicalDisplayName: true } },
                  product: { select: { canonicalDisplayName: true } },
                  version: { select: { canonicalDisplayName: true } },
                },
              },
              issues: { where: { deviceGroupMatchingId: { not: null } } },
              // TODO: continue testing, may need to include asset-level issues
              // here as well
            },
          },
        },
      },
      remediations: {
        include: {
          remediation: true,
        },
      },
    },
  });

  if (!notification) return null;

  const vulnerabilities = notification.vulnerabilities.map(
    (m) => m.vulnerability,
  );
  if (vulnerabilities.length === 0) return null;

  const remediations = notification.remediations.map((m) => m.remediation);

  // All matchings referenced by the linked vulnerabilities.
  // NOTE: An Issue relates a device group matching to a vuln. We only grab
  // DGM's related to vulns (not DGM's related to the notification) since this
  // agent only cares about Issue's, not the entire notification
  const matchingsById = new Map<string, MatchingWithRefs>();
  for (const v of vulnerabilities) {
    for (const dgm of v.deviceGroupMatchings) matchingsById.set(dgm.id, dgm);
  }
  const matchings = [...matchingsById.values()];

  // Resolve matchings → concrete device groups (with their assets) in one query.
  // TODO: if there's a device group with unknown version, that needs to create
  // an UNDER_INVESTIGATION issue
  const candidateGroups =
    matchings.length > 0
      ? await prisma.deviceGroup.findMany({
          where: { OR: matchings.map(deviceGroupWhereForMatching) },
          select: {
            id: true,
            vendorId: true,
            productId: true,
            versionId: true,
            cpe: true,
            vendor: { select: { canonicalDisplayName: true } },
            product: { select: { canonicalDisplayName: true } },
            version: {
              select: { canonicalName: true, canonicalDisplayName: true },
            },
            assets: {
              select: { id: true, hostname: true, ip: true },
            },
          },
        })
      : [];

  // matchingId → resolved device groups
  const groupsByMatching = new Map<string, typeof candidateGroups>();
  for (const matching of matchings) {
    groupsByMatching.set(
      matching.id,
      candidateGroups.filter((g) => matchingAppliesToDeviceGroup(matching, g)),
    );
  }

  // Baseline issues in scope: one per (vuln, matching) with a device-group match.
  const issues: VexIssueContext[] = [];
  type IssueRender = {
    issueId: string;
    cve: string;
    matching: MatchingWithRefs;
    groups: typeof candidateGroups;
    assetIds: string[];
    status: string;
  };
  const issueRenders: IssueRender[] = [];

  for (const v of vulnerabilities) {
    for (const issue of v.issues) {
      if (!issue.deviceGroupMatchingId) continue;
      const matching = matchingsById.get(issue.deviceGroupMatchingId);
      if (!matching) continue;
      const groups = groupsByMatching.get(matching.id) ?? [];
      const assetIds = [
        ...new Set(groups.flatMap((g) => g.assets.map((a) => a.id))),
      ];
      issues.push({ issueId: issue.id, vulnerabilityId: v.id, assetIds });
      issueRenders.push({
        issueId: issue.id,
        cve: v.cveId ?? v.id,
        matching,
        groups,
        assetIds,
        status: issue.status,
      });
    }
  }

  if (issues.length === 0) return null;

  // Notes: direct (targetModel + instanceId points at an in-scope entity) plus
  // all PERSISTENT notes (which always apply to the hospital).
  const allAssetIds = [
    ...new Set(candidateGroups.flatMap((g) => g.assets.map((a) => a.id))),
  ];
  const notes = await getRelevantNotes({
    vulnerabilityIds: vulnerabilities.map((v) => v.id),
    remediationIds: remediations.map((r) => r.id),
    deviceGroupMatchingIds: matchings.map((m) => m.id),
    assetIds: allAssetIds,
  });

  // Label lookups for rendering note targets.
  const assetLabel = new Map<string, string>();
  for (const g of candidateGroups) {
    for (const a of g.assets) assetLabel.set(a.id, a.hostname ?? a.ip ?? a.id);
  }
  const groupLabel = new Map(
    candidateGroups.map((g) => [g.id, deviceGroupLabel(g)]),
  );
  const matchingLabel = new Map(
    matchings.map((m) => [m.id, deviceGroupMatchingLabel(m)]),
  );
  const cveById = new Map(vulnerabilities.map((v) => [v.id, v.cveId ?? v.id]));

  const markdown = renderVexPrompt({
    sources: notification.sources,
    vulnerabilities,
    remediations,
    candidateGroups,
    issueRenders,
    notes,
    labels: { assetLabel, groupLabel, matchingLabel, cveById },
  });

  return { notificationId, markdown, issues };
}

type NoteRow = {
  text: string;
  status: string;
  targetModel: string | null;
  instanceId: string | null;
};

function renderNoteTarget(
  note: NoteRow,
  labels: {
    assetLabel: Map<string, string>;
    groupLabel: Map<string, string>;
    matchingLabel: Map<string, string>;
    cveById: Map<string, string>;
  },
): string {
  if (note.status === "PERSISTENT") return "Persistent (hospital-wide)";
  const id = note.instanceId ?? "";
  switch (note.targetModel) {
    case "ASSET":
      return `Asset ${labels.assetLabel.get(id) ?? id} (id: ${id})`;
    case "DEVICE_GROUP_MATCHING":
      return `Matching ${labels.matchingLabel.get(id) ?? id}`;
    case "VULNERABILITY":
      return `Vulnerability ${labels.cveById.get(id) ?? id}`;
    case "REMEDIATION":
      return `Remediation ${id}`;
    default:
      return "Unknown target";
  }
}

function renderVexPrompt(args: {
  sources: { markdown: string | null; channel: string }[];
  vulnerabilities: Array<{
    id: string;
    cveId: string | null;
    severity: string;
    cvssScore: number | null;
    description: string | null;
    narrative: string | null;
    impact: string | null;
    affectedComponents: string[];
  }>;
  remediations: Array<{
    id: string;
    description: string | null;
    narrative: string | null;
  }>;
  candidateGroups: Array<{
    id: string;
    cpe: string[];
    vendor?: { canonicalDisplayName: string } | null;
    product?: { canonicalDisplayName: string } | null;
    version?: { canonicalDisplayName: string } | null;
    assets: { id: string }[];
  }>;
  issueRenders: Array<{
    issueId: string;
    cve: string;
    matching: MatchingWithRefs;
    groups: Array<{ id: string }>;
    assetIds: string[];
    status: string;
  }>;
  notes: NoteRow[];
  labels: {
    assetLabel: Map<string, string>;
    groupLabel: Map<string, string>;
    matchingLabel: Map<string, string>;
    cveById: Map<string, string>;
  };
}): string {
  const sections: string[] = [];

  sections.push(
    "## Notification sources\n\n" +
      (args.sources
        .map((s) => s.markdown?.trim())
        .filter(Boolean)
        .join("\n\n---\n\n") || "_No source text._"),
  );

  sections.push(
    "## Linked vulnerabilities\n\n" +
      args.vulnerabilities
        .map((v) => {
          const lines = [
            `### ${v.cveId ?? v.id} — ${v.severity}${v.cvssScore != null ? ` (CVSS ${v.cvssScore})` : ""}`,
          ];
          if (v.affectedComponents.length > 0)
            lines.push(
              `- **Affected Components**: ${v.affectedComponents.join(", ")}`,
            );
          if (v.description) lines.push(`- **Description**: ${v.description}`);
          if (v.narrative)
            lines.push(`- **Exploit Narrative**: ${v.narrative}`);
          if (v.impact) lines.push(`- **Clinical Impact**: ${v.impact}`);
          return lines.join("\n");
        })
        .join("\n\n"),
  );

  if (args.remediations.length > 0) {
    sections.push(
      "## Linked remediations\n\n" +
        args.remediations
          .map((r) => {
            const lines = [`### Remediation ${r.id}`];
            if (r.description)
              lines.push(`- **Description**: ${r.description}`);
            if (r.narrative) lines.push(`- **How to Apply**: ${r.narrative}`);
            return lines.join("\n");
          })
          .join("\n\n"),
    );
  }

  sections.push(
    "## Linked device groups (with asset counts)\n\n" +
      (args.candidateGroups.length > 0
        ? args.candidateGroups
            .map(
              (g) =>
                `${deviceGroupToMarkdown(g)}\n- **Assets in this group**: ${g.assets.length}`,
            )
            .join("\n\n")
        : "_No device groups resolved._"),
  );

  if (args.notes.length > 0) {
    sections.push(
      "## Notes (evidence)\n\n" +
        args.notes
          .map((n) => `- **${renderNoteTarget(n, args.labels)}**: ${n.text}`)
          .join("\n"),
    );
  }

  sections.push(
    "## Issues to sort\n\n" +
      "Return a determination keyed by these exact issue ids. Omit an id (or return `{}`) to leave it unchanged.\n\n" +
      args.issueRenders
        .map((r) => {
          const groupLabels = r.groups
            .map((g) => args.labels.groupLabel.get(g.id) ?? g.id)
            .join(", ");
          const assets =
            r.assetIds.length > 0
              ? r.assetIds
                  .map(
                    (id) =>
                      `${args.labels.assetLabel.get(id) ?? id} (id: ${id})`,
                  )
                  .join(", ")
              : "none";
          return [
            `- Issue \`${r.issueId}\` — current status ${r.status}`,
            `  - Vulnerability: ${r.cve}`,
            `  - Device: ${deviceGroupMatchingLabel(r.matching)}${groupLabels ? ` → ${groupLabels}` : ""}`,
            `  - Assets (${r.assetIds.length}): ${assets}`,
          ].join("\n");
        })
        .join("\n\n"),
  );

  return sections.join("\n\n");
}

// ─── System prompt ───────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are an issue triage analyst for a hospital cybersecurity platform. A security notification references one or more vulnerabilities, and the platform has already opened one baseline Issue per (vulnerability × affected device group). Your job is to sort each issue into the correct exploitability status using ONLY the evidence provided.

Statuses:
- AFFECTED ("at risk"): the vulnerability is exploitable on this device group as deployed.
- UNDER_INVESTIGATION ("possibly at risk"): there is not enough detail about the device to decide. Use this when device details are insufficient.
- NOT_AFFECTED ("unaffected"): evidence shows the vulnerability is not exploitable here. You MUST provide a VEX justification:
  - COMPONENT_NOT_PRESENT: the affected feature/component is not enabled or installed (e.g. a note says the affected feature is off).
  - HOSPITAL_COMPENSATING_CONTROL: the hospital has a compensating control (e.g. an asset is not reachable over the network, which the exploit requires).
  - HOSPITAL_ACCEPTS_RISK: the hospital has explicitly accepted the risk.

Rules:
- Default: a determination applies to the whole device-group issue via "status".
- Only emit an asset-level override (under "assets") when a SPECIFIC asset differs from the rest of its group — e.g. a note is attached to that exact asset id. Never invent asset ids; use only the ids listed under the issue.
- If only one asset is an exception (e.g. one asset is not network-reachable) and the rest of the group is still affected, OMIT the group-level "status" so the device-group issue is left unchanged, and put the exception in "assets". Set the group "status" only when your determination applies to the whole group.
- Ground every decision in the provided sources, vulnerability descriptions, remediations, and notes. Never invent facts or numbers.
- Set confidence to Matched only with strong evidence; otherwise NeedsReview.
- Call the record_vex_determinations tool exactly once with your determinations. Omit issues you are not changing.`;
