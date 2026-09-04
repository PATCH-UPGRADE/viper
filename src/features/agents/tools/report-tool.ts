import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { existingIds } from "@/features/inbox/utils";
import prisma from "@/lib/db";
import {
  type CitationSegment,
  rewriteReportCitations,
} from "./report-citations";

// Which table backs each citable route segment (see report-citations.ts).
type Finder = Parameters<typeof existingIds>[0];
const FINDERS: Record<CitationSegment, Finder> = {
  assets: (a) => prisma.asset.findMany(a),
  vulnerabilities: (a) => prisma.vulnerability.findMany(a),
  remediations: (a) => prisma.remediation.findMany(a),
};

export function makeWriteReportTool(userId: string, threadId: string) {
  return tool(
    async ({ markdown }) => {
      const body = markdown.trim();
      if (!body) return "Report was empty — nothing saved.";

      const { markdown: validated, dropped } = await rewriteReportCitations(
        body,
        (segment, ids) => existingIds(FINDERS[segment], ids),
      );

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
