import "server-only";
import { tool } from "@langchain/core/tools";
import { fromMarkdown } from "mdast-util-from-markdown";
import { z } from "zod";
import { existingIds } from "@/features/inbox/utils";
import prisma from "@/lib/db";

// Citable route segments; keep in step with the examples in graph.ts. The
// deviceGroups key is its API route — device groups have no dashboard page.
type Finder = Parameters<typeof existingIds>[0];
const FINDERS = {
  assets: (a) => prisma.asset.findMany(a),
  vulnerabilities: (a) => prisma.vulnerability.findMany(a),
  remediations: (a) => prisma.remediation.findMany(a),
  "api/v1/deviceGroups": (a) => prisma.deviceGroup.findMany(a),
} satisfies Record<string, Finder>;
const ROUTE_RE = new RegExp(
  `^/(${Object.keys(FINDERS).join("|")})/([^/?#]+)/?(?:[?#].*)?$`,
);

export function makeWriteReportTool(userId: string, threadId: string) {
  return tool(
    async ({ title, markdown }) => {
      const body = markdown.trim();
      if (!body) return "Report was empty — nothing saved.";

      // Parse actual links, including references, without touching code examples.
      const nodes = [...fromMarkdown(body).children];
      for (const node of nodes) {
        if ("children" in node) nodes.push(...node.children);
      }
      const definitions = new Map(
        nodes
          .filter((node) => node.type === "definition")
          .map((node) => [node.identifier, node.url]),
      );
      const links = nodes.flatMap((node) => {
        if (node.type !== "link" && node.type !== "linkReference") return [];
        const url =
          node.type === "link" ? node.url : definitions.get(node.identifier);
        const match = url?.match(ROUTE_RE);
        return match ? [{ node, segment: match[1], id: match[2] }] : [];
      });
      // existingIds skips the DB when a segment has no cited ids.
      const valid = new Map(
        await Promise.all(
          Object.entries(FINDERS).map(async ([segment, findMany]) => {
            const ids = links
              .filter((link) => link.segment === segment)
              .map((link) => link.id);
            return [segment, await existingIds(findMany, ids)] as const;
          }),
        ),
      );
      let report = body;
      // Work backwards so replacing a link never shifts another link's offsets.
      for (const { node, segment, id } of links.sort(
        (a, b) =>
          b.node.position!.start.offset! - a.node.position!.start.offset!,
      )) {
        if (valid.get(segment)?.has(id)) continue;
        const label = node.children.length
          ? body.slice(
              node.children[0].position!.start.offset!,
              node.children.at(-1)!.position!.end.offset!,
            )
          : "";
        report =
          report.slice(0, node.position!.start.offset!) +
          label +
          report.slice(node.position!.end.offset!);
      }

      // Ownership check first — update() can only key on the unique id.
      const thread = await prisma.chatThread.findFirst({
        where: { id: threadId, userId },
        select: { id: true },
      });
      if (!thread) {
        return "Could not save the report — thread not found.";
      }
      const data = { title, content: report };
      await prisma.chatThread.update({
        where: { id: threadId },
        data: { report: { upsert: { create: data, update: data } } },
        select: { id: true },
      });

      return "Report saved. Tell the user it is ready; don't paste it into chat.";
    },
    {
      name: "write_report",
      description:
        "Create or replace this conversation's full Markdown report when asked for a report, briefing, or write-up. The read-only report panel supports PDF/Word export. Cite retrieved records using the routes in the report instructions; unresolved citations become plain text. Reply briefly in chat after saving.",
      schema: z.object({
        title: z
          .string()
          .describe(
            "A short descriptive title for the report (e.g. 'CT Scanner Vulnerability Report'). Replaces any existing title for the thread.",
          ),
        markdown: z
          .string()
          .describe(
            "The full report as Markdown (headings, prose, bullet lists, tables, and citation links). This replaces any existing report for the thread.",
          ),
      }),
    },
  );
}
