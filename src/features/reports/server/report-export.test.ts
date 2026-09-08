// @vitest-environment node

import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { renderReportDocx } from "./report-docx";
import { parseReportMarkdown } from "./report-markdown";
import { renderReportPdf, textWithLinks, wrap } from "./report-pdf";

const MD = `# Remediation plan

A short **intro** with a [MRI-01](/assets/abc) link and \`inline code\`.

## Steps

- First item
- Second item with *emphasis*

1. Ordered one
2. Ordered two

> A caution to keep in mind.

\`\`\`
patch --apply MRI-01
\`\`\`

| Device | Risk |
| --- | --- |
| [MRI-01](/assets/table_asset) | High |
`;

describe("parseReportMarkdown", () => {
  const blocks = parseReportMarkdown(MD);

  it("normalizes tables, blockquotes, and fenced code into paragraphs", () => {
    const types = new Set(blocks.map((b) => b.type));
    expect(types).toEqual(new Set(["heading", "paragraph", "listItem"]));
  });

  it("keeps the link href and inline styles on spans", () => {
    const para = blocks.find(
      (b) => b.type === "paragraph" && b.spans.some((s) => s.href),
    );
    expect(para).toBeDefined();
    const link =
      para?.type === "paragraph" ? para.spans.find((s) => s.href) : undefined;
    expect(link?.href).toBe("/assets/abc");
    expect(para?.type === "paragraph" && para.spans.some((s) => s.bold)).toBe(
      true,
    );
  });

  it("numbers ordered list items", () => {
    const markers = blocks
      .filter((b) => b.type === "listItem" && b.ordered)
      .map((b) => (b.type === "listItem" ? b.marker : ""));
    expect(markers).toEqual(["1.", "2."]);
  });

  it("keeps a table cell's citation link when flattening the row to a paragraph", () => {
    const hrefs = blocks.flatMap((b) =>
      b.type === "paragraph" ? b.spans.map((s) => s.href) : [],
    );
    expect(hrefs).toContain("/assets/table_asset");
  });
});

describe("renderers", () => {
  it("renders a PDF", async () => {
    const pdf = await renderReportPdf(MD);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders a .docx (zip) file", async () => {
    const docx = await renderReportDocx(MD);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
  });

  it("does not throw on empty markdown", async () => {
    expect((await renderReportPdf("")).length).toBeGreaterThan(0);
  });

  it("renders a PDF with non-WinAnsi characters", async () => {
    // Arrow, thin space, CJK — pdf-lib's standard fonts can't encode these.
    const pdf = await renderReportPdf("See MRI → CT. 影像. Done.​ \u0080");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("wraps long citation URLs without losing text or exceeding the page width", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const url = `https://vendor.example/advisories/${"a".repeat(200)}`;
    const lines = wrap(url, font, 10.5, 484);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(url);
    expect(
      lines.every((line) => font.widthOfTextAtSize(line, 10.5) <= 484),
    ).toBe(true);
  });

  it("paginates long reports", async () => {
    const pdf = await PDFDocument.load(
      await renderReportPdf("A paragraph.\n\n".repeat(100)),
    );
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});

describe("textWithLinks", () => {
  it("keeps a citation's target readable — PDF text isn't clickable, so the href is printed", () => {
    expect(
      textWithLinks([
        { text: "See " },
        { text: "MRI-01", href: "/assets/abc" },
        { text: " for details." },
      ]),
    ).toBe("See MRI-01 (/assets/abc) for details.");
  });

  it("leaves plain text untouched", () => {
    expect(textWithLinks([{ text: "No links here." }])).toBe("No links here.");
  });
});
