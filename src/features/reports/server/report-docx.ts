import "server-only";
import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { getApiUrl } from "@/lib/url-utils";
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
  return /^https?:\/\//.test(href) ? href : getApiUrl(href);
}

function runs(spans: InlineSpan[]): (TextRun | ExternalHyperlink)[] {
  return spans.map((s) => {
    if (s.text === "\n") return new TextRun({ break: 1 });
    if (s.href) {
      return new ExternalHyperlink({
        link: absolute(s.href),
        children: [new TextRun({ text: s.text, style: "Hyperlink" })],
      });
    }
    return new TextRun({ text: s.text, bold: s.bold, italics: s.italic });
  });
}

function blockParagraph(block: ReportBlock): Paragraph {
  const list = block.type === "listItem" ? block : null;
  return new Paragraph({
    heading: block.type === "heading" ? HEADING[block.depth] : undefined,
    bullet: list && !list.ordered ? { level: 0 } : undefined,
    children: [
      ...(list?.ordered ? [new TextRun({ text: `${list.marker} ` })] : []),
      ...runs(block.spans),
    ],
  });
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
    children.push(blockParagraph(block));
  }

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}
