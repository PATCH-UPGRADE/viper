import "server-only";
import { getRelevantNotes } from "@/features/notes/server/get-relevant-notes";
import prisma from "@/lib/db";
import {
  deviceGroupWhereForMatching,
  type MatchingLike,
  matchingAppliesToDeviceGroup,
} from "@/lib/device-matching";
import {
  deviceGroupMatchingLabel,
  type NoteRow,
  type NoteTargetLabels,
  renderNoteTarget,
} from "@/lib/markdown";
import { renderQnA } from "@/lib/markdown/note";

export type QuestionIssueContext = { issueId: string; vulnerabilityId: string };

export type QuestionContext = {
  notificationId: string;
  markdown: string;
  issues: QuestionIssueContext[];
};

type MatchingWithRefs = MatchingLike & {
  id: string;
  manufacturer?: { canonicalDisplayName: string } | null;
  product?: { canonicalDisplayName: string } | null;
  version?: { canonicalDisplayName: string } | null;
};

function renderQuestionPrompt(args: {
  vulnerabilities: Array<{
    cveId: string | null;
    severity: string;
    description: string | null;
  }>;
  issueRenders: Array<{
    issueId: string;
    cve: string;
    matching: MatchingWithRefs;
    assetCount: number;
    statusNotes: string | null;
  }>;
  notes: NoteRow[];
  labels: NoteTargetLabels;
}): string {
  const sections: string[] = [];

  sections.push(
    "## Linked vulnerabilities\n\n" +
      args.vulnerabilities
        .map(
          (v) =>
            `### ${v.cveId ?? "unknown CVE"} - ${v.severity}\n${v.description ?? ""}`,
        )
        .join("\n\n"),
  );

  if (args.notes.length > 0) {
    sections.push(
      "## Notes (evidence)\n\n" +
        args.notes
          .map((n) => {
            const target = renderNoteTarget(n, args.labels);
            return target ? `- **${target}** ${n.text}` : `- ${n.text}`;
          })
          .join("\n"),
    );
  }
  sections.push(
    "## Issues that need a question \n\n" +
      "Each of these is currently UNDER INVESTIGATION. Draft a specific, answerable " +
      " question for any you can meaningfully clarify. Omit an id to skip it. \n\n" +
      args.issueRenders
        .map((r) =>
          [
            `- Issue  ${r.issueId} - ${r.cve}`,
            `- Device: ${deviceGroupMatchingLabel(r.matching)}`,
            ` - Assets affected: ${r.assetCount}`,
            ` - Why this is under investigation: ${r.statusNotes ?? "(no reason recorded)"}`,
          ].join("\n"),
        )
        .join("\n\n"),
  );

  return sections.join("\n\n");
}

function buildNoteLabels(args: {
  groups: { assets: { id: string; hostname: string | null; ip: string }[] }[];
  matchings: MatchingWithRefs[];
  vulnerabilities: { id: string; cveId: string | null }[];
}): NoteTargetLabels {
  return {
    assetLabel: new Map(
      args.groups.flatMap((g) =>
        g.assets.map(
          (asset) =>
            [asset.id, asset.hostname ?? asset.ip ?? asset.id] as const,
        ),
      ),
    ),
    groupLabel: new Map(),
    matchingLabel: new Map(
      args.matchings.map((matching) => [
        matching.id,
        deviceGroupMatchingLabel(matching) || matching.id,
      ]),
    ),
    cveById: new Map(
      args.vulnerabilities.map(
        (vulnerability) =>
          [vulnerability.id, vulnerability.cveId ?? vulnerability.id] as const,
      ),
    ),
  };
}

export async function gatherQuestionContext(
  notificationId: string,
): Promise<QuestionContext | null> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      vulnerabilities: {
        include: {
          vulnerability: {
            include: {
              deviceGroupMatchings: {
                include: {
                  manufacturer: { select: { canonicalDisplayName: true } },
                  product: { select: { canonicalDisplayName: true } },
                  version: { select: { canonicalDisplayName: true } },
                },
              },
              issues: {
                where: {
                  deviceGroupMatchingId: { not: null },
                  status: "UNDER_INVESTIGATION",
                  questions: { none: { status: "PENDING" } },
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

  const matchingsById = new Map<string, MatchingWithRefs>();
  for (const v of vulnerabilities) {
    for (const dgm of v.deviceGroupMatchings) matchingsById.set(dgm.id, dgm);
  }
  const matchings = [...matchingsById.values()];

  const candidateGroups =
    matchings.length > 0
      ? await prisma.deviceGroup.findMany({
          where: { OR: matchings.map(deviceGroupWhereForMatching) },
          select: {
            id: true,
            manufacturerId: true,
            productId: true,
            versionId: true,
            version: { select: { canonicalName: true } },
            assets: {
              select: { id: true, hostname: true, ip: true },
            },
          },
        })
      : [];

  const groupsByMatching = new Map<string, typeof candidateGroups>();
  for (const matching of matchings) {
    groupsByMatching.set(
      matching.id,
      candidateGroups.filter((g) => matchingAppliesToDeviceGroup(matching, g)),
    );
  }

  const issues: QuestionIssueContext[] = [];
  type IssueRender = {
    issueId: string;
    cve: string;
    matching: MatchingWithRefs;
    assetCount: number;
    statusNotes: string | null;
  };
  const issueRenders: IssueRender[] = [];

  for (const v of vulnerabilities) {
    for (const issue of v.issues) {
      if (!issue.deviceGroupMatchingId) continue;
      const matching = matchingsById.get(issue.deviceGroupMatchingId);

      if (!matching) continue;
      const groups = groupsByMatching.get(matching.id) ?? [];

      issues.push({ issueId: issue.id, vulnerabilityId: v.id });

      issueRenders.push({
        issueId: issue.id,
        cve: v.cveId ?? v.id,
        matching,
        assetCount: groups.reduce(
          (num, groups) => num + groups.assets.length,
          0,
        ),
        statusNotes: issue.statusNotes,
      });
    }
  }

  if (issues.length === 0) return null;

  const assetIds = [
    ...new Set(candidateGroups.flatMap((g) => g.assets.map((a) => a.id))),
  ];
  const notes = await getRelevantNotes({
    vulnerabilityIds: vulnerabilities.map((v) => v.id),
    deviceGroupMatchingIds: matchings.map((m) => m.id),
    assetIds,
  });

  const labels: NoteTargetLabels = buildNoteLabels({
    groups: candidateGroups,
    matchings,
    vulnerabilities,
  });

  const markdown = renderQuestionPrompt({
    vulnerabilities,
    issueRenders,
    notes,
    labels,
  });

  return { notificationId, markdown, issues };
}

// ─── System prompt ───────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are drafting clarifying questions for a hospital security engineer, for vulnerability issues a triage agent already marked "under investigation" because it lacked enough information to decide if the vulnerability is exploitable.
For each issue, use the stated reason it's under investigation to write ONE specific, answerable question - never a vague "please provide more information." Include 2-6 short suggested answers a user could pick instead of typing. Ground every question in the evidence given; never invent facts about the device or vulnerability.
For each question also record who could answer it: MANUFACTURER if the company that built the device could answer from product knowledge alone, VENDOR if it depends on how this hospital's own units are deployed or configured.
Omit any issue you don't have a good, specific question for.`;

export async function gatherQuestionContextForIssue(
  issueId: string,
  notificationId: string,
  priorQnA: { title: string; answer: string | null }[],
): Promise<QuestionContext | null> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: { vulnerability: true },
  });

  if (!issue || !issue.deviceGroupMatchingId) return null;

  const matching = await prisma.deviceGroupMatching.findUnique({
    where: { id: issue.deviceGroupMatchingId },
    include: {
      manufacturer: { select: { canonicalDisplayName: true } },
      product: { select: { canonicalDisplayName: true } },
      version: { select: { canonicalDisplayName: true } },
    },
  });

  if (!matching) return null;

  const candidateGroups = await prisma.deviceGroup.findMany({
    where: deviceGroupWhereForMatching(matching),
    select: {
      id: true,
      manufacturerId: true,
      productId: true,
      versionId: true,
      version: { select: { canonicalName: true } },
      assets: { select: { id: true, hostname: true, ip: true } },
    },
  });

  const groups = candidateGroups.filter((g) =>
    matchingAppliesToDeviceGroup(matching, g),
  );
  const assetIds = [
    ...new Set(groups.flatMap((g) => g.assets.map((a) => a.id))),
  ];

  const notes = await getRelevantNotes({
    vulnerabilityIds: [issue.vulnerabilityId],
    deviceGroupMatchingIds: [matching.id],
    assetIds,
  });

  const labels: NoteTargetLabels = buildNoteLabels({
    groups,
    matchings: [matching],
    vulnerabilities: [issue.vulnerability],
  });

  const priorQnAText = priorQnA
    .map((q) => renderQnA(q.title, q.answer))
    .join("\n\n");

  const markdown =
    renderQuestionPrompt({
      vulnerabilities: [issue.vulnerability],
      issueRenders: [
        {
          issueId: issue.id,
          cve: issue.vulnerability.cveId ?? issue.vulnerability.id,
          matching,
          assetCount: groups.reduce((n, g) => n + g.assets.length, 0),
          statusNotes: issue.statusNotes,
        },
      ],
      notes,
      labels,
    }) +
    "\n\n## Already asked and answered - do not repeat this, ask something more specific\n\n" +
    priorQnAText;

  return {
    notificationId,
    markdown,
    issues: [{ issueId: issue.id, vulnerabilityId: issue.vulnerability.id }],
  };
}
