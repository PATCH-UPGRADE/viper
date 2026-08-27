// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildBriefingPdf, toPlainText } from "../briefing-export";

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
});
