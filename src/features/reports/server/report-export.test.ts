// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderReportDocx } from "./report-docx";
import { parseReportMarkdown } from "./report-markdown";
import { renderReportPdf } from "./report-pdf";

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
| MRI-01 | High |
`;

describe("parseReportMarkdown", () => {
  const blocks = parseReportMarkdown(MD);

  it("splits into the expected block types (blockquote + fenced code collapse to paragraph)", () => {
    const types = new Set(blocks.map((b) => b.type));
    expect(types).toEqual(
      new Set(["heading", "paragraph", "listItem", "table"]),
    );
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
});

describe("renderers", () => {
  it("renders a PDF", async () => {
    const pdf = await renderReportPdf("Remediation plan", MD);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders a .docx (zip) file", async () => {
    const docx = await renderReportDocx("Remediation plan", MD);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
  });

  it("does not throw on empty markdown", async () => {
    expect((await renderReportPdf(null, "")).length).toBeGreaterThan(0);
  });

  it("renders a PDF with non-WinAnsi characters", async () => {
    // Arrow, thin space, CJK — pdf-lib's standard fonts can't encode these.
    const pdf = await renderReportPdf("Report", "See MRI → CT. 影像. Done.​");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
