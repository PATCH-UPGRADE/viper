// VEX sorting agent: given a notification that has linked vulnerabilities, sort
// each baseline Issue (one per vulnerability × device-group-matching, created by
// vulnerabilityExtension) into "at risk" (AFFECTED), "possibly at risk"
// (UNDER_INVESTIGATION), or "unaffected" (NOT_AFFECTED + a VEX justification),
// using the hospital's notes and compensating controls as evidence. May also
// create asset-level override issues when a single asset differs from its group.

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  type ConfidenceLevel,
  type IssueStatus,
  NotAffectedJustification,
} from "@/generated/prisma";
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

const MODEL = "claude-sonnet-4-6";

// ─── Structured output schema ────────────────────────────────────────────────
//
// The output is keyed by existing baseline Issue cuid (built dynamically per
// request in buildVexSchema) so the model must consider every specific issue;
// an omitted or empty value means "no change". `status` is a discriminated
// union so a justification is required exactly when status is NOT_AFFECTED.

const statusSchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("AFFECTED") }),
    z.object({ status: z.literal("UNDER_INVESTIGATION") }),
    z.object({
      status: z.literal("NOT_AFFECTED"),
      justification: z
        .nativeEnum(NotAffectedJustification)
        .describe(
          "VEX justification — required when the status is NOT_AFFECTED",
        ),
    }),
  ])
  .describe(
    "The determination. AFFECTED = at risk, UNDER_INVESTIGATION = possibly at risk (insufficient detail), NOT_AFFECTED = unaffected (must carry a justification).",
  );

const assetOverrideSchema = z.object({
  id: z
    .string()
    .describe(
      "Asset id — must be one of the asset ids listed under this issue. Only emit an override when this single asset differs from the rest of its device group.",
    ),
  status: statusSchema,
  reasonWhy: z.string().describe("Concise justification for this asset."),
});

const issueValueSchema = z.object({
  status: statusSchema
    .nullish()
    .describe(
      "The device-group-level determination. Omit to leave the group issue unchanged while still flagging an asset exception below.",
    ),
  reasonWhy: z
    .string()
    .nullish()
    .describe("Concise reasoning for the group-level status, if you set one."),
  confidence: z
    .enum(["NeedsReview", "Matched"])
    .nullish()
    .describe(
      "Matched = strong evidence; NeedsReview = plausible but a human should verify. Never Confirmed (human-only).",
    ),
  assets: z
    .array(assetOverrideSchema)
    .nullish()
    .describe(
      "Asset-level overrides. Leave empty unless a specific asset differs from its device group (e.g. a note on that asset id).",
    ),
});

/** Build the per-request tool schema: one optional property per baseline issue id. */
function buildVexSchema(issueIds: string[]) {
  return z.object(
    Object.fromEntries(issueIds.map((id) => [id, issueValueSchema.optional()])),
  );
}

// Loose types (independent of the dynamic zod schema) used by the deterministic
// planner so it can be unit-tested without constructing the schema.
type StatusValue = {
  status: IssueStatus;
  justification?: NotAffectedJustification | null;
};
type AssetOverrideValue = {
  id: string;
  status: StatusValue;
  reasonWhy: string;
};
type IssueValue = {
  status?: StatusValue;
  reasonWhy?: string;
  confidence?: "NeedsReview" | "Matched";
  assets?: AssetOverrideValue[] | null;
};
export type VexResult = Record<string, IssueValue | undefined>;

// ─── Context ─────────────────────────────────────────────────────────────────

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
            },
          },
        },
      },
      remediations: {
        include: {
          remediation: {
            include: {
              deviceGroupMatchings: {
                include: {
                  vendor: { select: { canonicalDisplayName: true } },
                  product: { select: { canonicalDisplayName: true } },
                  version: { select: { canonicalDisplayName: true } },
                },
              },
            },
          },
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

  // All matchings referenced by the linked vulns (+ remediations, for notes).
  const matchingsById = new Map<string, MatchingWithRefs>();
  for (const v of vulnerabilities) {
    for (const dgm of v.deviceGroupMatchings) matchingsById.set(dgm.id, dgm);
  }
  for (const r of remediations) {
    for (const dgm of r.deviceGroupMatchings) matchingsById.set(dgm.id, dgm);
  }
  const matchings = [...matchingsById.values()];

  // Resolve matchings → concrete device groups (with their assets) in one query.
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
  const groupIds = candidateGroups.map((g) => g.id);
  const allAssetIds = [
    ...new Set(candidateGroups.flatMap((g) => g.assets.map((a) => a.id))),
  ];
  const notes = await prisma.note.findMany({
    where: {
      OR: [
        { status: "PERSISTENT" },
        {
          targetModel: "VULNERABILITY",
          instanceId: { in: vulnerabilities.map((v) => v.id) },
        },
        {
          targetModel: "REMEDIATION",
          instanceId: { in: remediations.map((r) => r.id) },
        },
        { targetModel: "DEVICE_GROUP", instanceId: { in: groupIds } },
        {
          targetModel: "DEVICE_GROUP_MATCHING",
          instanceId: { in: matchings.map((m) => m.id) },
        },
        { targetModel: "ASSET", instanceId: { in: allAssetIds } },
      ],
    },
    select: { text: true, status: true, targetModel: true, instanceId: true },
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
    case "DEVICE_GROUP":
      return `Device group ${labels.groupLabel.get(id) ?? id}`;
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

const SYSTEM_PROMPT = `You are a VEX (Vulnerability Exploitability eXchange) analyst for a hospital cybersecurity platform. A security notification references one or more vulnerabilities, and the platform has already opened one baseline Issue per (vulnerability × affected device group). Your job is to sort each issue into the correct exploitability status using ONLY the evidence provided.

Statuses:
- AFFECTED ("at risk"): the vulnerability is exploitable on this device group as deployed.
- UNDER_INVESTIGATION ("possibly at risk"): there is not enough detail about the device to decide. Use this when device details are insufficient.
- NOT_AFFECTED ("unaffected"): evidence shows the vulnerability is not exploitable here. You MUST provide a VEX justification:
  - COMPONENT_NOT_PRESENT: the affected feature/component is not enabled or installed (e.g. a note says the affected feature is off).
  - VULNERABLE_CODE_NOT_PRESENT / VULNERABLE_CODE_NOT_IN_EXECUTE_PATH: the vulnerable code isn't shipped or never runs.
  - VULNERABLE_CODE_CANNOT_BE_CONTROLLED_BY_ADVERSARY: the exploit path can't be reached (e.g. log4shell on an infusion pump that never takes adversarial input).
  - INLINE_MITIGATIONS_ALREADY_EXIST: a built-in mitigation neutralizes the vuln.
  - HOSPITAL_COMPENSATING_CONTROL: the hospital has a compensating control (e.g. an asset is not reachable over the network, which the exploit requires).
  - HOSPITAL_ACCEPTS_RISK: the hospital has explicitly accepted the risk.

Rules:
- Default: a determination applies to the whole device-group issue via "status".
- Only emit an asset-level override (under "assets") when a SPECIFIC asset differs from the rest of its group — e.g. a note is attached to that exact asset id. Never invent asset ids; use only the ids listed under the issue.
- If only one asset is an exception (e.g. one asset is not network-reachable) and the rest of the group is still affected, OMIT the group-level "status" so the device-group issue is left unchanged, and put the exception in "assets". Set the group "status" only when your determination applies to the whole group.
- Ground every decision in the provided sources, vulnerability descriptions, remediations, and notes. Never invent facts or numbers.
- Set confidence to Matched only with strong evidence; otherwise NeedsReview.
- Call the record_vex_determinations tool exactly once with your determinations. Omit issues you are not changing.`;

// ─── Model call ──────────────────────────────────────────────────────────────

export async function sortVulnerabilities(
  context: VexContext,
): Promise<VexResult> {
  const issueIds = context.issues.map((i) => i.issueId);
  const schema = buildVexSchema(issueIds);

  const recordTool = tool(async () => "ok", {
    name: "record_vex_determinations",
    description:
      "Record the VEX determination for each issue, keyed by issue id. Omit issues that are unchanged.",
    schema,
  });

  // Extended thinking requires tool_choice "auto" (no forcing), so we bind the
  // single tool and read the call args instead of using withStructuredOutput.
  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 8000,
    thinking: { type: "enabled", budget_tokens: 4000 },
  }).bindTools([recordTool]);

  const res = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: context.markdown },
  ]);

  const call = res.tool_calls?.find(
    (c) => c.name === "record_vex_determinations",
  );
  if (!call) return {};

  const parsed = schema.safeParse(call.args);
  return parsed.success ? (parsed.data as VexResult) : {};
}

// ─── Deterministic apply ─────────────────────────────────────────────────────

export type VexApplySummary = { updated: number; created: number };

type IssueUpdateOp = {
  issueId: string;
  status: IssueStatus;
  justification: NotAffectedJustification | null;
  confidence: ConfidenceLevel;
  notes: string;
};
type AssetOverrideOp = {
  assetId: string;
  vulnerabilityId: string;
  status: IssueStatus;
  justification: NotAffectedJustification | null;
  confidence: ConfidenceLevel;
  notes: string;
};

/** Normalize a status value, dropping NOT_AFFECTED without a justification. */
function normalizeStatus(status: StatusValue | undefined): {
  status: IssueStatus;
  justification: NotAffectedJustification | null;
} | null {
  if (!status?.status) return null;
  if (status.status === "NOT_AFFECTED") {
    if (!status.justification) return null;
    return { status: "NOT_AFFECTED", justification: status.justification };
  }
  return { status: status.status, justification: null };
}

/**
 * Turn an agent VexResult into deterministic write ops. Pure + guarded (no DB):
 * skips ids that aren't baseline issues in context (hallucinations), skips
 * NOT_AFFECTED without a justification, and skips asset overrides whose id isn't
 * reachable through the issue. Unit-tested in isolation.
 */
export function planVexWrites(
  context: VexContext,
  result: VexResult,
): { issueUpdates: IssueUpdateOp[]; assetOverrides: AssetOverrideOp[] } {
  const issuesById = new Map(context.issues.map((i) => [i.issueId, i]));
  const issueUpdates: IssueUpdateOp[] = [];
  const assetOverrides: AssetOverrideOp[] = [];

  for (const [issueId, value] of Object.entries(result)) {
    const ctx = issuesById.get(issueId);
    if (!ctx || !value) continue; // hallucinated id or no-change

    const confidence: ConfidenceLevel =
      value.confidence === "Matched" ? "Matched" : "NeedsReview";

    // Group-level update only when a status was supplied. A determination may
    // carry only asset overrides, leaving the device-group issue untouched.
    const norm = normalizeStatus(value.status);
    if (norm) {
      issueUpdates.push({
        issueId,
        status: norm.status,
        justification: norm.justification,
        confidence,
        notes: value.reasonWhy ?? "",
      });
    }

    for (const override of value.assets ?? []) {
      if (!ctx.assetIds.includes(override.id)) continue; // out-of-scope asset
      const aNorm = normalizeStatus(override.status);
      if (!aNorm) continue;
      assetOverrides.push({
        assetId: override.id,
        vulnerabilityId: ctx.vulnerabilityId,
        status: aNorm.status,
        justification: aNorm.justification,
        confidence,
        notes: override.reasonWhy ?? "",
      });
    }
  }

  return { issueUpdates, assetOverrides };
}

/** Apply planned VEX writes to the database in a single transaction. */
export async function applyVexDeterminations(
  context: VexContext,
  result: VexResult,
): Promise<VexApplySummary> {
  const { issueUpdates, assetOverrides } = planVexWrites(context, result);

  await prisma.$transaction(async (tx) => {
    for (const op of issueUpdates) {
      await tx.issue.update({
        where: { id: op.issueId },
        data: {
          status: op.status,
          notAffectedJustification: op.justification,
          statusConfidence: op.confidence,
          statusNotes: op.notes,
        },
      });
    }

    for (const op of assetOverrides) {
      await tx.issue.upsert({
        where: {
          assetId_vulnerabilityId: {
            assetId: op.assetId,
            vulnerabilityId: op.vulnerabilityId,
          },
        },
        create: {
          assetId: op.assetId,
          vulnerabilityId: op.vulnerabilityId,
          status: op.status,
          notAffectedJustification: op.justification,
          statusConfidence: op.confidence,
          statusNotes: op.notes,
        },
        update: {
          status: op.status,
          notAffectedJustification: op.justification,
          statusConfidence: op.confidence,
          statusNotes: op.notes,
        },
      });
    }
  });

  return { updated: issueUpdates.length, created: assetOverrides.length };
}

/**
 * End-to-end entry point used by the inbox pipeline: gather context, run the
 * agent, and apply the result. Returns null when the notification has no linked
 * vulnerabilities / issues to sort.
 */
export async function sortNotificationVulnerabilities(
  notificationId: string,
): Promise<(VexApplySummary & { issues: number }) | null> {
  const context = await gatherVexContext(notificationId);
  if (!context) return null;
  const result = await sortVulnerabilities(context);
  const summary = await applyVexDeterminations(context, result);
  return { ...summary, issues: context.issues.length };
}
