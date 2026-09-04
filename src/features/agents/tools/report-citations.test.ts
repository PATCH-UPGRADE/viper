// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rewriteReportCitations } from "./report-citations";

const md = [
  "# Fleet report",
  "",
  "[MRI-01](/assets/asset_ok) is affected by [CVE-2024-1](/vulnerabilities/vuln_ok).",
  "Ghost link: [MRI-99](/assets/asset_missing).",
  "Not a citation: [docs](/somewhere/else) and [ext](https://example.com).",
].join("\n");

describe("rewriteReportCitations", () => {
  it("keeps links whose id resolves and de-links the rest", async () => {
    const { markdown, dropped } = await rewriteReportCitations(
      md,
      (seg, ids) => {
        expect(["assets", "vulnerabilities"]).toContain(seg);
        const ok = new Set(ids.filter((id) => id.endsWith("_ok")));
        return Promise.resolve(ok);
      },
    );

    expect(markdown).toContain("[MRI-01](/assets/asset_ok)");
    expect(markdown).toContain("[CVE-2024-1](/vulnerabilities/vuln_ok)");
    expect(markdown).toContain("Ghost link: MRI-99.");
    expect(markdown).not.toContain("asset_missing");
    // Non-entity routes and external links are left untouched.
    expect(markdown).toContain("[docs](/somewhere/else)");
    expect(markdown).toContain("[ext](https://example.com)");
    expect(dropped).toBe(1);
  });

  it("does not hit the resolver when there are no citations", async () => {
    const { markdown, dropped } = await rewriteReportCitations(
      "plain text",
      () => Promise.reject(new Error("should not be called")),
    );
    expect(markdown).toBe("plain text");
    expect(dropped).toBe(0);
  });
});
