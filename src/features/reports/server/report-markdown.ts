import "server-only";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

export interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Link text — app-relative, e.g. "/assets/abc". */
  href?: string;
}

export type ReportBlock =
  | { type: "heading"; depth: number; spans: InlineSpan[] }
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "listItem"; ordered: boolean; marker: string; spans: InlineSpan[] };

type Node = ReturnType<typeof fromMarkdown>["children"][number];

function inlineSpans(
  nodes: Node[],
  ctx: { bold?: boolean; italic?: boolean; href?: string } = {},
): InlineSpan[] {
  return nodes.flatMap((n): InlineSpan[] => {
    switch (n.type) {
      case "text":
      case "inlineCode":
        return [{ text: n.value, ...ctx }];
      case "strong":
        return inlineSpans(n.children, { ...ctx, bold: true });
      case "emphasis":
        return inlineSpans(n.children, { ...ctx, italic: true });
      case "link":
        return inlineSpans(n.children, { ...ctx, href: n.url });
      case "break":
        return [{ text: "\n", ...ctx }];
      default:
        return "children" in n ? inlineSpans(n.children, ctx) : [];
    }
  });
}

function pushList(
  blocks: ReportBlock[],
  list: Extract<Node, { type: "list" }>,
): void {
  const ordered = Boolean(list.ordered);
  let n = list.start ?? 1;
  for (const item of list.children) {
    const marker = ordered ? `${n}.` : "•";
    n += 1;
    for (const child of item.children) {
      if (child.type === "list") {
        pushList(blocks, child); // ponytail: nested lists lose their indent
      } else {
        blocks.push({
          type: "listItem",
          ordered,
          marker,
          spans:
            child.type === "code"
              ? [{ text: child.value }]
              : inlineSpans("children" in child ? child.children : [child]),
        });
      }
    }
  }
}

export function parseReportMarkdown(markdown: string): ReportBlock[] {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const blocks: ReportBlock[] = [];

  for (const node of tree.children) {
    switch (node.type) {
      case "heading":
        blocks.push({
          type: "heading",
          depth: node.depth,
          spans: inlineSpans(node.children),
        });
        break;
      case "paragraph":
        blocks.push({ type: "paragraph", spans: inlineSpans(node.children) });
        break;
      case "blockquote":
        blocks.push({
          type: "paragraph",
          spans: inlineSpans(
            node.children.flatMap<Node>((c) =>
              "children" in c ? c.children : [],
            ),
          ),
        });
        break;
      case "list":
        pushList(blocks, node);
        break;
      case "code":
        blocks.push({ type: "paragraph", spans: [{ text: node.value }] });
        break;
      case "table":
        // One paragraph per row, keeping each cell's links and styles.
        node.children.forEach((row, i) => {
          blocks.push({
            type: "paragraph",
            spans: row.children.flatMap((cell, j) => [
              ...(j ? [{ text: "   |   " }] : []),
              ...inlineSpans(cell.children, { bold: i === 0 }),
            ]),
          });
        });
        break;
      default:
        break;
    }
  }
  return blocks;
}
