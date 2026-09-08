import "server-only";
import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib";
import { type InlineSpan, parseReportMarkdown } from "./report-markdown";

const WIDTH = 612;
const HEIGHT = 792;
const MARGIN = 64;
const MAX_W = WIDTH - MARGIN * 2;

const DARK = rgb(0.07, 0.09, 0.15);
const BODY = rgb(0.13, 0.16, 0.22);

const HEADING_SIZE: Record<number, number> = { 1: 20, 2: 16, 3: 13 };
const BODY_SIZE = 10.5;
const LINE = 15;

const SUBST: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "‑": "-",
  "​": "",
};
// Print citation targets because v1 PDFs have no clickable link annotations.
export function textWithLinks(spans: InlineSpan[]): string {
  return spans
    .map((s) => (s.href ? `${s.text} (${s.href})` : s.text))
    .join("")
    .trim();
}

export function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
      // URLs and identifiers may be wider than a page even on their own.
      while (font.widthOfTextAtSize(line, size) > maxWidth) {
        let end = line.length - 1;
        while (
          end > 1 &&
          font.widthOfTextAtSize(line.slice(0, end), size) > maxWidth
        )
          end--;
        lines.push(line.slice(0, end));
        line = line.slice(end);
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderReportPdf(markdown: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(regular.getCharacterSet());

  let page = doc.addPage([WIDTH, HEIGHT]);
  let y = HEIGHT - MARGIN;

  const draw = (
    raw: string,
    { font = regular, size = BODY_SIZE, indent = 0, gap = 4 } = {},
  ) => {
    const text = [...raw]
      .map((ch) =>
        /\s/.test(ch) || supported.has(ch.codePointAt(0)!)
          ? ch
          : (SUBST[ch] ?? "?"),
      )
      .join("");
    const lineHeight = Math.max(LINE, size + 3);
    for (const line of wrap(text, font, size, MAX_W - indent)) {
      if (y - lineHeight < MARGIN) {
        page = doc.addPage([WIDTH, HEIGHT]);
        y = HEIGHT - MARGIN;
      }
      y -= lineHeight;
      page.drawText(line, {
        x: MARGIN + indent,
        y,
        size,
        font,
        color: font === bold ? DARK : BODY,
      });
    }
    y -= gap;
  };

  for (const block of parseReportMarkdown(markdown)) {
    const heading = block.type === "heading";
    const list = block.type === "listItem";
    if (heading) y -= 6;
    draw(`${list ? `${block.marker}  ` : ""}${textWithLinks(block.spans)}`, {
      font: heading ? bold : regular,
      size: heading ? (HEADING_SIZE[block.depth] ?? 11) : BODY_SIZE,
      indent: list ? 12 : 0,
      gap: heading ? 6 : list ? 4 : 8,
    });
  }

  return Buffer.from(await doc.save());
}
