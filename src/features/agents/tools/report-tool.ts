import "server-only";
import { tool } from "@langchain/core/tools";
import { fromMarkdown } from "mdast-util-from-markdown";
import { z } from "zod";
import { existingIds } from "@/features/inbox/utils";
import prisma from "@/lib/db";
import { escapeRegExp } from "@/lib/string-utils";
import { collectIds, type Retrieval } from "./query-platform-tool";

// Citable route segments; keep in step with the examples in graph.ts. The
// deviceGroups key is its API route — device groups have no dashboard page.
type Finder = Parameters<typeof existingIds>[0];
const FINDERS = {
  assets: (a) => prisma.asset.findMany(a),
  vulnerabilities: (a) => prisma.vulnerability.findMany(a),
  remediations: (a) => prisma.remediation.findMany(a),
  "api/v1/deviceGroups": (a) => prisma.deviceGroup.findMany(a),
  workflows: (a) => prisma.workflow.findMany(a),
  inbox: (a) => prisma.notification.findMany(a),
} satisfies Record<string, Finder>;
const ROUTE_RE = new RegExp(
  `^/(${Object.keys(FINDERS).join("|")})/([^/?#]+)/?(?:[?#].*)?$`,
);

/** Ids fetched this turn plus those in earlier, persisted turns. */
async function retrievedIds(
  threadId: string,
  retrieval: Retrieval,
): Promise<Set<string>> {
  await Promise.allSettled(retrieval.pending);
  const ids = new Set(retrieval.ids);
  const rows = await prisma.chatMessage.findMany({
    where: { threadId, role: "ASSISTANT" },
    select: { toolCalls: true },
  });
  for (const { toolCalls } of rows) {
    if (!Array.isArray(toolCalls)) continue;
    for (const part of toolCalls as { type?: string; output?: unknown }[]) {
      if (part?.type === "tool-query_platform_data")
        collectIds(part.output, ids);
    }
  }
  return ids;
}

/** Route citations and prose text; code blocks and link targets are skipped. */
function parse(markdown: string) {
  const nodes = [...fromMarkdown(markdown).children];
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
    return match ? [`/${match[1]}/${match[2]}`] : [];
  });
  const prose = nodes
    .flatMap((node) => (node.type === "text" ? node.value : []))
    .join("\n");
  return { links, prose };
}

/**
 * Refuse citations in newText to records not retrieved in this thread, then
 * append retrieved assets/CVEs the report names but never cites under Sources.
 */
async function finalizeCitations(
  report: string,
  newText: string,
  threadId: string,
  retrieval: Retrieval,
): Promise<string> {
  const seen = await retrievedIds(threadId, retrieval);
  const added = parse(newText).links.map((path) => path.match(ROUTE_RE)!);
  const valid = new Map(
    await Promise.all(
      Object.entries(FINDERS).map(async ([segment, findMany]) => {
        const ids = added
          .filter(([, s, id]) => s === segment && seen.has(id))
          .map(([, , id]) => id);
        return [segment, await existingIds(findMany, ids)] as const;
      }),
    ),
  );
  // Refuse rather than strip, so the model learns what it must look up.
  const bad = added.filter(([, segment, id]) => !valid.get(segment)?.has(id));
  if (bad.length) {
    throw new Error(
      `Not saved. Cite only records you retrieved with query_platform_data; look these up or drop the links: ${bad.map(([path]) => path).join(", ")}`,
    );
  }

  // Only assets and CVEs have a short name to spot in prose.
  if (seen.size === 0) return report;
  const ids = [...seen];
  const [assets, vulnerabilities] = await Promise.all([
    prisma.asset.findMany({
      where: { id: { in: ids }, hostname: { not: null } },
      select: { id: true, hostname: true },
    }),
    prisma.vulnerability.findMany({
      where: { id: { in: ids }, cveId: { not: null } },
      select: { id: true, cveId: true },
    }),
  ]);
  const { links, prose } = parse(report);
  const sources = [
    ...assets.map((a) => [`/assets/${a.id}`, a.hostname!]),
    ...vulnerabilities.map((v) => [`/vulnerabilities/${v.id}`, v.cveId!]),
  ]
    .filter(
      ([path, name]) =>
        !links.includes(path) &&
        new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, "i").test(
          prose,
        ),
    )
    .map(([path, name]) => `- [${name}](${path})`);
  if (sources.length === 0) return report;
  return report.match(/^#{1,6} .*$/gm)?.at(-1) === "## Sources"
    ? `${report.trimEnd()}\n${sources.join("\n")}`
    : `${report}\n\n## Sources\n${sources.join("\n")}`;
}

export function makeWriteReportTool(
  userId: string,
  threadId: string,
  retrieval: Retrieval,
) {
  return tool(
    async ({ title, markdown }) => {
      const body = markdown.trim();
      if (!body) return "Report was empty — nothing saved.";
      const report = await finalizeCitations(body, body, threadId, retrieval);

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
        "Create or replace this conversation's full Markdown report when asked for a report, briefing, or write-up. The read-only report panel supports PDF/Word export. Cite only records you retrieved, using the routes in the report instructions; other citations are refused. Reply briefly in chat after saving.",
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

async function fetchReport(userId: string, threadId: string) {
  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, userId },
    select: { report: { select: { id: true, content: true } } },
  });
  return thread?.report?.content ? thread.report : null;
}

export function makeSearchReportTool(userId: string, threadId: string) {
  return tool(
    async ({ query }) => {
      const report = (await fetchReport(userId, threadId))?.content ?? "";
      const needle = query.toLowerCase();
      const hits = report.split("\n").flatMap((line, i) => {
        const at = line.toLowerCase().indexOf(needle);
        return at < 0
          ? []
          : `Line ${i + 1}: ${line.slice(Math.max(0, at - 80), at + query.length + 80)}`;
      });
      return hits.slice(0, 5).join("\n") || `No matches for "${query}".`;
    },
    {
      name: "search_report",
      description:
        "Case-insensitive search of the saved report. Returns up to 5 matching lines (line number + text around the match) so you can locate text without reading the whole report.",
      schema: z.object({ query: z.string().min(1) }),
    },
  );
}

export function makeReadReportTool(userId: string, threadId: string) {
  return tool(
    async ({ startLine }) => {
      const report = (await fetchReport(userId, threadId))?.content;
      if (!report) return "No report has been saved yet.";
      const lines = report.split("\n");

      let end = startLine - 1;
      let body = "";
      for (const line of lines.slice(end, end + 200)) {
        const row = `${end + 1}\t${line}`.slice(0, 6000);
        if (body && body.length + row.length > 6000) break;
        body += `${body ? "\n" : ""}${row}`;
        end++;
      }
      const next = end < lines.length ? `; continue at ${end + 1}` : "";
      return `${body}\n[Lines ${startLine}-${end} of ${lines.length}${next}]`;
    },
    {
      name: "read_report",
      description:
        "Read up to 200 line-numbered lines of the saved report from startLine (default 1); page with the continue hint. Lines over 6000 characters are clipped — use search_report to see further into them.",
      schema: z.object({ startLine: z.number().int().min(1).default(1) }),
    },
  );
}

export function makeEditReportTool(
  userId: string,
  threadId: string,
  retrieval: Retrieval,
) {
  return tool(
    async ({ oldText, newText }) => {
      const saved = await fetchReport(userId, threadId);
      if (!saved) return "No report yet — use write_report to create one.";
      const { id, content } = saved;

      const at = content.indexOf(oldText);
      if (at < 0)
        return "oldText not found. Re-read the section for the exact text.";
      if (content.indexOf(oldText, at + 1) >= 0) {
        return "oldText matches more than one place. Add surrounding text to make it unique.";
      }

      const updated = await prisma.chatReport.updateMany({
        // compare-and-swap: fails if the report changed since we read it
        where: { id, content },
        data: {
          content: await finalizeCitations(
            content.slice(0, at) + newText + content.slice(at + oldText.length),
            newText,
            threadId,
            retrieval,
          ),
        },
      });
      return updated.count
        ? "Replaced."
        : "The report changed during the edit; re-read and retry.";
    },
    {
      name: "edit_report",
      description:
        "Replace one exact occurrence of oldText with newText in the saved report (oldText must match exactly one place; find it with search_report/read_report). Use write_report to create the report or rewrite it in full.",
      schema: z.object({ oldText: z.string().min(1), newText: z.string() }),
    },
  );
}
