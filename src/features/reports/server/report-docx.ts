import "server-only";
import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { getBaseUrl } from "@/lib/url-utils";
import {
  type InlineSpan,
  parseReportMarkdown,
  type ReportBlock,
  reportGeneratedLine,
  reportTitle,
} from "./report-markdown";

type Level = (typeof HeadingLevel)[keyof typeof HeadingLevel];
const HEADING: Record<number, Level> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

function absolute(href: string): string {
  return /^https?:\/\//.test(href) ? href : `${getBaseUrl()}${href}`;
}

function runs(spans: InlineSpan[]): (TextRun | ExternalHyperlink)[] {
  return spans
    .filter((s) => s.text !== "\n")
    .map((s) => {
      if (s.href) {
        return new ExternalHyperlink({
          link: absolute(s.href),
          children: [new TextRun({ text: s.text, style: "Hyperlink" })],
        });
      }
      return new TextRun({ text: s.text, bold: s.bold, italics: s.italic });
    });
}

function blockParagraphs(block: ReportBlock): Paragraph[] {
  switch (block.type) {
    case "heading":
      return [
        new Paragraph({
          heading: HEADING[block.depth],
          children: runs(block.spans),
        }),
      ];
    case "paragraph":
      return [new Paragraph({ children: runs(block.spans) })];
    case "listItem":
      // Ordered items get their marker drawn as literal text (matching the PDF
      // export) rather than a Word numbering definition — simpler than
      // registering a numbering config for what's otherwise a flat list.
      return [
        block.ordered
          ? new Paragraph({
              children: [
                new TextRun({ text: `${block.marker} ` }),
                ...runs(block.spans),
              ],
            })
          : new Paragraph({
              bullet: { level: 0 },
              children: runs(block.spans),
            }),
      ];
    case "table":
      // ponytail: flattened to text rows, same as the PDF export.
      return block.rows.map(
        (row, i) =>
          new Paragraph({
            children: [
              new TextRun({ text: row.join("   |   "), bold: i === 0 }),
            ],
          }),
      );
  }
}

export async function renderReportDocx(
  title: string | null,
  markdown: string,
): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: reportTitle(title) })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: reportGeneratedLine(),
          italics: true,
          color: "6B7280",
        }),
      ],
    }),
    new Paragraph({ text: "" }),
  ];

  for (const block of parseReportMarkdown(markdown)) {
    children.push(...blockParagraphs(block));
  }

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}
