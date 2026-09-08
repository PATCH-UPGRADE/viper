import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { existingIds } from "@/features/inbox/utils";
import prisma from "@/lib/db";

// Each citable route segment and the table that backs it. Device groups link
// to their API detail route (no dashboard page). Keep this list in step with
// the citation examples in the report prompt (graph.ts).
type Finder = Parameters<typeof existingIds>[0];
const FINDERS = {
  assets: (a) => prisma.asset.findMany(a),
  vulnerabilities: (a) => prisma.vulnerability.findMany(a),
  remediations: (a) => prisma.remediation.findMany(a),
  "api/v1/deviceGroups": (a) => prisma.deviceGroup.findMany(a),
} satisfies Record<string, Finder>;
type CitationSegment = keyof typeof FINDERS;

const LINK_RE = new RegExp(
  `\\[([^\\]]+)\\]\\(/(${Object.keys(FINDERS)
    .map((s) => s.replace(/\//g, "\\/"))
    .join("|")})/([A-Za-z0-9_-]+)\\)`,
  "g",
);

export function makeWriteReportTool(userId: string, threadId: string) {
  return tool(
    async ({ markdown }) => {
      const body = markdown.trim();
      if (!body) return "Report was empty — nothing saved.";

      // One scan collects cited ids per segment; resolve every segment in
      // parallel; one pass de-links citations whose id didn't resolve.
      const cited = new Map<CitationSegment, Set<string>>();
      for (const [, , segment, id] of body.matchAll(LINK_RE)) {
        const seg = segment as CitationSegment;
        if (!cited.has(seg)) cited.set(seg, new Set());
        cited.get(seg)?.add(id);
      }
      const valid = new Map<CitationSegment, Set<string>>();
      await Promise.all(
        [...cited].map(async ([seg, ids]) => {
          valid.set(seg, await existingIds(FINDERS[seg], [...ids]));
        }),
      );
      const report = body.replace(
        LINK_RE,
        (link, label: string, segment: string, id: string) =>
          valid.get(segment as CitationSegment)?.has(id) ? link : label,
      );

      const updated = await prisma.chatThread.updateMany({
        where: { id: threadId, userId },
        data: { report },
      });
      if (updated.count === 0) {
        return "Could not save the report — thread not found.";
      }

      return "Report saved. Tell the user it is ready; don't paste it into chat.";
    },
    {
      name: "write_report",
      description:
        "Create or replace this conversation's full Markdown report when asked for a report, briefing, or write-up. The read-only report panel supports PDF/Word export. Cite retrieved records using the routes in the report instructions; unresolved citations become plain text. Reply briefly in chat after saving.",
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
