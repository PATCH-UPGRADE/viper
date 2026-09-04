import "server-only";
import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib";
import {
  type InlineSpan,
  parseReportMarkdown,
  type ReportBlock,
  reportGeneratedLine,
  reportTitle,
} from "./report-markdown";

// Manual layout, same approach as features/assets/server/qr-pdf.ts (no headless
// browser): walk the Markdown blocks, draw each one, move a `y` cursor down,
// start a new page when it runs past the bottom margin.

const WIDTH = 612;
const HEIGHT = 792;
const MARGIN = 64;
const MAX_W = WIDTH - MARGIN * 2;

const DARK = rgb(0.07, 0.09, 0.15);
const BODY = rgb(0.13, 0.16, 0.22);

const HEADING_SIZE: Record<number, number> = { 1: 20, 2: 16, 3: 13 };
const BODY_SIZE = 10.5;
const LINE = 15;

// pdf-lib's StandardFonts only encode WinAnsi; a stray Unicode char (an arrow, a
// thin space, CJK) throws at draw time. Map the punctuation the agent emits and
// drop anything else outside Latin-1 that WinAnsi still covers.
const WINANSI_EXTRA = new Set("–—‘’“”•…™€");
const SUBST: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "‑": "-",
  " ": " ",
  " ": " ",
  "​": "",
};
function sanitize(text: string): string {
  return [...text]
    .map((ch) =>
      ch.codePointAt(0)! <= 0xff || WINANSI_EXTRA.has(ch)
        ? ch
        : // ponytail: unmapped chars (e.g. CJK) become "?" rather than vanishing
          // silently — a document a CFO reads shouldn't lose words with no trace.
          // Real fix if this bites: embed a Unicode TTF via @pdf-lib/fontkit
          // instead of pdf-lib's WinAnsi-only StandardFonts.
          (SUBST[ch] ?? "?"),
    )
    .join("");
}

// pdf-lib text isn't clickable (no link annotations here — that needs
// per-span layout, not worth it for v1), so a citation would otherwise read
// as plain text with no way to find the source. Keep the target visible
// instead: ponytail: assumes one plain-text span per link, true for every
// citation write_report actually emits ([label](/segment/id)).
export function textWithLinks(spans: InlineSpan[]): string {
  return spans
    .map((s) => (s.href ? `${s.text} (${s.href})` : s.text))
    .join("")
    .trim();
}

/** Greedy word-wrap to `maxWidth`. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
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
    }
    lines.push(line);
  }
  return lines;
}

export async function renderReportPdf(
  title: string | null,
  markdown: string,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([WIDTH, HEIGHT]);
  let y = HEIGHT - MARGIN;

  const draw = (
    raw: string,
    { font = regular, size = BODY_SIZE, indent = 0, gap = 4 } = {},
  ) => {
    const text = sanitize(raw);
    for (const line of wrap(text, font, size, MAX_W - indent)) {
      if (y - LINE < MARGIN) {
        page = doc.addPage([WIDTH, HEIGHT]);
        y = HEIGHT - MARGIN;
      }
      y -= Math.max(LINE, size + 3);
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

  const block = (b: ReportBlock) => {
    switch (b.type) {
      case "heading":
        y -= 6;
        draw(textWithLinks(b.spans), {
          font: bold,
          size: HEADING_SIZE[b.depth] ?? 11,
          gap: 6,
        });
        break;
      case "paragraph":
        draw(textWithLinks(b.spans), { gap: 8 });
        break;
      case "listItem":
        draw(`${b.marker}  ${textWithLinks(b.spans)}`, { indent: 12, gap: 4 });
        break;
      case "table":
        b.rows.forEach((row, i) => {
          draw(row.join("   |   "), { font: i === 0 ? bold : regular, gap: 2 });
        });
        y -= 8;
        break;
    }
  };

  draw(reportTitle(title), { font: bold, size: 24, gap: 2 });
  draw(reportGeneratedLine(), { size: 9, gap: 14 });
  for (const b of parseReportMarkdown(markdown)) block(b);

  return Buffer.from(await doc.save());
}
