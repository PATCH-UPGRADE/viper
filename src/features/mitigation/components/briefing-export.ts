import type { PDFFont } from "pdf-lib";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const LEADING = 15;
const TITLE_SIZE = 15;
const HEADER_SIZE = 12;
const BODY_SIZE = 11;

// Splits the agent's "**Header**\nBody" markdown blocks (see renderSection in
// src/features/inbox/agent/briefing/schema.ts) into {header, body} pairs.
// Shared by the PDF export and plain-text copy below, and by briefing-panel's
// bulleted layout — schema.ts can't export this itself since it's
// server-only and briefing-panel is a client component.
export function parseSections(
  markdown: string,
): { header: string | null; body: string }[] {
  return markdown
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const m = block.match(/^\*\*(.+?)\*\*\s*\n?([\s\S]*)$/);
      return m
        ? { header: m[1].trim(), body: m[2].trim() }
        : { header: null, body: block };
    });
}

export function toPlainText(markdown: string): string {
  return parseSections(markdown)
    .map((s) => (s.header ? `${s.header}:\n${s.body}` : s.body))
    .join("\n\n");
}

// Standard PDF fonts only support WinAnsi (win1252) — the agent's prose can
// include smart quotes/em-dashes/emoji, which would otherwise throw at draw
// time. win1252 covers all of Latin-1 (U+00A0-U+00FF, e.g. "é"), so only
// U+0100+ needs the "?" fallback. Control characters (\x00-\x1F, \x7F-\x9F)
// aren't in win1252 either and would throw the same way — stripped here,
// except \n which wrapText below still splits paragraphs on.
export function sanitize(text: string): string {
  return (
    text
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping the control chars WinAnsi can't encode, \n excluded
      .replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, "")
      .replace(/[Ā-￿]/g, "?")
  );
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

export async function buildBriefingPdf(
  title: string,
  markdown: string,
): Promise<Blob> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const [font, bold] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const draw = (text: string, size: number, f: PDFFont) => {
    if (y < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    page.drawText(text, { x: MARGIN, y, size, font: f });
    y -= LEADING;
  };
  const drawLines = (lines: string[], size: number, f: PDFFont) => {
    for (const line of lines) draw(line, size, f);
  };
  const drawWrapped = (text: string, size: number, f: PDFFont) =>
    drawLines(wrapText(sanitize(text), f, size, maxWidth), size, f);

  drawWrapped(title, TITLE_SIZE, bold);
  y -= LEADING / 2;

  for (const section of parseSections(markdown)) {
    if (section.header) drawWrapped(section.header, HEADER_SIZE, bold);
    drawWrapped(section.body, BODY_SIZE, font);
    y -= LEADING / 2;
  }

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
