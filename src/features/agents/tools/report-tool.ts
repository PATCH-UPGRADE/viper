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

/**
 * An unresolved citation becomes plain text — applied to every write, full or
 * targeted, so the invariant holds regardless of which tool touched the report.
 */
async function stripInvalidCitations(body: string): Promise<string> {
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
  return report;
}

/** The saved report, scoped to the authorized user + thread. Null if none yet. */
async function fetchReport(userId: string, threadId: string) {
  const row = await prisma.chatThread.findFirst({
    where: { id: threadId, userId },
    select: { report: true },
  });
  return row?.report ?? null;
}

export function makeWriteReportTool(userId: string, threadId: string) {
  return tool(
    async ({ markdown }) => {
      const body = markdown.trim();
      if (!body) return "Report was empty — nothing saved.";
      const report = await stripInvalidCitations(body);

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
        "Create this conversation's report, or intentionally replace it in full, when asked for a report, briefing, write-up, or a full rewrite. For a small change to an existing report, use edit_report instead — it doesn't require resending the whole document. The read-only report panel supports PDF/Word export. Cite retrieved records using the routes in the report instructions; unresolved citations become plain text. Reply briefly in chat after saving.",
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

const READ_MAX_LINES = 200;
const READ_MAX_CHARS = 6000;

export function makeReadReportTool(userId: string, threadId: string) {
  return tool(
    async ({ startLine }) => {
      const report = await fetchReport(userId, threadId);
      if (report === null)
        return "No report has been saved yet for this thread.";

      const lines = report.split("\n");
      const total = lines.length;
      if (startLine > total) {
        return `startLine ${startLine} is past the end of the report (${total} lines total).`;
      }

      let end = Math.min(total, startLine - 1 + READ_MAX_LINES);
      let body = lines
        .slice(startLine - 1, end)
        .map((line, i) => `${startLine + i}\t${line}`)
        .join("\n");
      if (body.length > READ_MAX_CHARS) {
        body = body.slice(0, READ_MAX_CHARS);
        end = startLine - 1 + body.split("\n").length;
      }

      const more =
        end < total
          ? ` Call read_report again with startLine: ${end + 1} to continue.`
          : "";
      return `${body}\n\n[Showing lines ${startLine}-${end} of ${total}.${more}]`;
    },
    {
      name: "read_report",
      description:
        "Read a bounded range of the saved report, line-numbered like a file viewer. Defaults to the first 200 lines; pass startLine to continue reading further chunks. Call it as many times as needed — never assume you already have the whole report.",
      schema: z.object({
        startLine: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe("1-based line number to start from."),
      }),
    },
  );
}

export function makeEditReportTool(userId: string, threadId: string) {
  return tool(
    async ({ oldText, newText }) => {
      const current = await fetchReport(userId, threadId);
      if (current === null) {
        return "No report exists yet for this thread — use write_report to create one.";
      }

      const at = current.indexOf(oldText);
      if (at === -1) {
        return "Could not find that exact text in the report. Re-read the relevant section to get the exact current text, then try again.";
      }
      if (current.indexOf(oldText, at + 1) !== -1) {
        return "That text matches more than one place in the report. Include more surrounding text so the match is unique.";
      }

      const newBody =
        current.slice(0, at) + newText + current.slice(at + oldText.length);
      const report = await stripInvalidCitations(newBody);

      // Atomic compare-and-swap: only write if nothing changed the report since
      // we read `current` above, so a concurrent edit can't be silently lost.
      const updated = await prisma.chatThread.updateMany({
        where: { id: threadId, userId, report: current },
        data: { report },
      });
      if (updated.count === 0) {
        return "The report changed since you read it — re-read the affected section and try again.";
      }

      return "Replaced.";
    },
    {
      name: "edit_report",
      description:
        "Apply one exact text replacement to the saved report. oldText must match exactly one place — get it, with enough surrounding context to be unique, from read_report first. Returns a short confirmation, not the full report. Fails with an actionable error if oldText is missing, matches more than once, or if the report changed since you read it (re-read and retry). Use write_report instead to create a report or intentionally rewrite it in full.",
      schema: z.object({
        oldText: z
          .string()
          .min(1)
          .describe(
            "Exact text currently in the report to replace, with enough surrounding context to be unique.",
          ),
        newText: z.string().describe("Text to put in its place."),
      }),
    },
  );
}
