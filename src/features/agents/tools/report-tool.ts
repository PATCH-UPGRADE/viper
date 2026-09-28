import "server-only";
import { tool } from "@langchain/core/tools";
import { fromMarkdown } from "mdast-util-from-markdown";
import { z } from "zod";
import { escapeRegExp } from "@/features/agents/debrief/validate";
import { existingIds } from "@/features/inbox/utils";
import prisma from "@/lib/db";
import { collectIds } from "./query-platform-tool";

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

/** Ids fetched with query_platform_data in earlier, persisted turns. */
async function priorRetrievedIds(threadId: string): Promise<Set<string>> {
  const ids = new Set<string>();
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

// One history read per turn: the first save merges it into that turn's set.
const seeding = new WeakMap<Set<string>, Promise<void>>();
function seedRetrieved(threadId: string, retrieved: Set<string>) {
  if (!seeding.has(retrieved))
    seeding.set(
      retrieved,
      priorRetrievedIds(threadId).then((ids) => {
        for (const id of ids) retrieved.add(id);
      }),
    );
  return seeding.get(retrieved);
}

/**
 * Keep only citations to records that exist and were retrieved in this thread,
 * then list retrieved assets/CVEs the text names but never cites under Sources.
 */
async function finalizeCitations(
  body: string,
  threadId: string,
  retrieved: Set<string>,
): Promise<string> {
  await seedRetrieved(threadId, retrieved);

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
  // Only retrieved ids are worth a lookup; existingIds skips empty segments.
  const valid = new Map(
    await Promise.all(
      Object.entries(FINDERS).map(async ([segment, findMany]) => {
        const ids = links
          .filter((link) => link.segment === segment && retrieved.has(link.id))
          .map((link) => link.id);
        return [segment, await existingIds(findMany, ids)] as const;
      }),
    ),
  );
  const cited = new Set(
    links
      .filter(({ segment, id }) => valid.get(segment)?.has(id))
      .map(({ segment, id }) => `/${segment}/${id}`),
  );
  let report = body;
  // Work backwards so replacing a link never shifts another link's offsets.
  for (const { node, segment, id } of links.sort(
    (a, b) => b.node.position!.start.offset! - a.node.position!.start.offset!,
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

  // Only assets and CVEs have a short name a model writes into prose;
  // remediations and device groups have none to match on.
  if (retrieved.size === 0) return report;
  const ids = [...retrieved];
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
  const sources = [
    ...assets.map((a) => ({ name: a.hostname!, path: `/assets/${a.id}` })),
    ...vulnerabilities.map((v) => ({
      name: v.cveId!,
      path: `/vulnerabilities/${v.id}`,
    })),
  ]
    .filter(
      ({ name, path }) =>
        !cited.has(path) &&
        new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, "i").test(
          report,
        ),
    )
    .map(({ name, path }) => `- [${name}](${path})`);
  if (sources.length === 0) return report;
  // ponytail: assumes an existing Sources section is the last one.
  return /^## Sources$/m.test(report)
    ? `${report.trimEnd()}\n${sources.join("\n")}`
    : `${report}\n\n## Sources\n${sources.join("\n")}`;
}

export function makeWriteReportTool(
  userId: string,
  threadId: string,
  retrieved: Set<string>,
) {
  return tool(
    async ({ title, markdown }) => {
      const body = markdown.trim();
      if (!body) return "Report was empty — nothing saved.";
      const report = await finalizeCitations(body, threadId, retrieved);

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
  retrieved: Set<string>,
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
            threadId,
            retrieved,
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
