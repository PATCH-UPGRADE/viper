import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { existingIds } from "@/features/inbox/utils";
import prisma from "@/lib/db";

// Report citations are plain Markdown links to the app's own entity routes,
// e.g. `[MRI-01](/assets/cly...)`. Before saving, every such link is checked
// against the real record ids; an id that doesn't resolve is de-linked (kept
// as plain text) rather than failing the whole save.
const CITATION_SEGMENTS = [
  "assets",
  "vulnerabilities",
  "remediations",
] as const;
type CitationSegment = (typeof CITATION_SEGMENTS)[number];
const LINK_RE = new RegExp(
  `\\[([^\\]]+)\\]\\(/(${CITATION_SEGMENTS.join("|")})/([A-Za-z0-9_-]+)\\)`,
  "g",
);

// Which table backs each citable route segment.
type Finder = Parameters<typeof existingIds>[0];
const FINDERS: Record<CitationSegment, Finder> = {
  assets: (a) => prisma.asset.findMany(a),
  vulnerabilities: (a) => prisma.vulnerability.findMany(a),
  remediations: (a) => prisma.remediation.findMany(a),
};

/**
 * Rewrite `markdown`, keeping only citation links whose id resolves against
 * the real table. Returns the cleaned markdown and how many links were
 * de-linked.
 */
async function rewriteReportCitations(
  markdown: string,
): Promise<{ markdown: string; dropped: number }> {
  // Collect cited ids per segment, then replace each Set with the subset that
  // actually resolves.
  const bySegment = new Map<CitationSegment, Set<string>>();
  for (const [, , segment, id] of markdown.matchAll(LINK_RE)) {
    const seg = segment as CitationSegment;
    if (!bySegment.has(seg)) bySegment.set(seg, new Set());
    bySegment.get(seg)?.add(id);
  }
  await Promise.all(
    [...bySegment].map(async ([seg, ids]) => {
      bySegment.set(seg, await existingIds(FINDERS[seg], [...ids]));
    }),
  );

  let dropped = 0;
  const rewritten = markdown.replace(
    LINK_RE,
    (full, label: string, segment: string, id: string) => {
      if (bySegment.get(segment as CitationSegment)?.has(id)) return full;
      dropped += 1;
      return label;
    },
  );
  return { markdown: rewritten, dropped };
}

export function makeWriteReportTool(userId: string, threadId: string) {
  return tool(
    async ({ markdown }) => {
      const body = markdown.trim();
      if (!body) return "Report was empty — nothing saved.";

      const { markdown: validated, dropped } =
        await rewriteReportCitations(body);

      const updated = await prisma.chatThread.updateMany({
        where: { id: threadId, userId },
        data: { report: validated },
      });
      if (updated.count === 0) {
        return "Could not save the report — thread not found.";
      }

      return `Report saved and is now shown in the report panel.${
        dropped > 0
          ? ` ${dropped} citation link(s) resolved to nothing and were de-linked.`
          : ""
      } State in your reply that the report is ready; don't paste it back.`;
    },
    {
      name: "write_report",
      description: `Create or replace the formatted report for this conversation. The report is shown to the user in a separate read-only panel and can be exported to PDF/Word — it is NOT part of the chat transcript, so keep answering the user in normal chat text as well.
Call this when the user asks for a report, briefing, summary document, or write-up. Calling it again fully replaces the previous report (this is how revisions work — the user re-prompts, you rewrite).
The report is Markdown. Cite specific records as normal Markdown links to their Viper route: [MRI-01](/assets/<assetId>), [CVE-2024-1234](/vulnerabilities/<vulnerabilityId>), [<name>](/remediations/<remediationId>). Use ONLY ids returned by query_platform_data — links with unknown ids are stripped. Do not invent CVSS scores, versions, counts, or hostnames; look them up with query_platform_data first.`,
      schema: z.object({
        markdown: z
          .string()
          .describe(
            "The full report as Markdown (headings, prose, bullet lists, tables, and citation links). This replaces any existing report for the thread.",
          ),
      }),
    },
  );
}
