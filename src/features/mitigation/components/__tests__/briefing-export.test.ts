// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildBriefingPdf, sanitize, toPlainText } from "../briefing-export";

const SAMPLE_MARKDOWN = [
  "**Security exposure**\nBoth pumps are reachable from the clinical network.",
  "**Why this plan, not the alternatives**\nFastest full remediation.",
  "**Why now**\nVendor confirms active exploitation.",
].join("\n\n");

describe("toPlainText", () => {
  it("flattens bold headers into label: body blocks", () => {
    expect(toPlainText(SAMPLE_MARKDOWN)).toBe(
      [
        "Security exposure:\nBoth pumps are reachable from the clinical network.",
        "Why this plan, not the alternatives:\nFastest full remediation.",
        "Why now:\nVendor confirms active exploitation.",
      ].join("\n\n"),
    );
  });

  it("passes through a plain paragraph with no header", () => {
    expect(toPlainText("Just a sentence.")).toBe("Just a sentence.");
  });
});

describe("sanitize", () => {
  it("leaves Latin-1 accented characters alone — WinAnsi natively supports them", () => {
    expect(sanitize("Société Générale — café")).toBe("Société Générale - café");
  });

  it("strips control characters WinAnsi can't encode, e.g. a pasted tab", () => {
    expect(sanitize("Column A\tColumn B")).toBe("Column AColumn B");
  });

  it("preserves newlines so wrapText's paragraph splitting still works", () => {
    expect(sanitize("Line one\nLine two")).toBe("Line one\nLine two");
  });

  it('still falls back to "?" for characters truly outside WinAnsi', () => {
    expect(sanitize("emoji 🎉 here")).toBe("emoji ?? here");
  });
});

describe("buildBriefingPdf", () => {
  it("renders a valid PDF for a real briefing section", async () => {
    const blob = await buildBriefingPdf(
      "Patch affected pumps tonight — briefing for CISO",
      SAMPLE_MARKDOWN,
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("does not throw on smart quotes/em-dashes outside WinAnsi", async () => {
    const blob = await buildBriefingPdf(
      "Title",
      "**Why now**\nThe vendor's fix — confirmed “critical” — ships tonight.",
    );
    expect(blob.size).toBeGreaterThan(0);
  });

  it("does not throw on a pasted control character (e.g. a tab)", async () => {
    const blob = await buildBriefingPdf(
      "Title",
      "**Security exposure**\nColumn A\tColumn B\tColumn C",
    );
    expect(blob.size).toBeGreaterThan(0);
  });
});
