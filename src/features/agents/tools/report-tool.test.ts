// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/db";
import { makeWriteReportTool } from "./report-tool";

vi.mock("@/lib/db", () => ({
  default: {
    asset: { findMany: vi.fn() },
    vulnerability: { findMany: vi.fn() },
    remediation: { findMany: vi.fn() },
    deviceGroup: { findMany: vi.fn() },
    chatThread: { updateMany: vi.fn() },
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.chatThread.updateMany).mockResolvedValue({ count: 1 });
});

describe("write_report", () => {
  it("batch-validates all four citation types and saves the full report", async () => {
    for (const model of [
      prisma.asset,
      prisma.vulnerability,
      prisma.remediation,
      prisma.deviceGroup,
    ]) {
      // Only the selected id field is returned by citation lookups.
      model.findMany = vi.fn().mockResolvedValue([{ id: "valid" }]);
    }
    const routes = [
      "assets",
      "vulnerabilities",
      "remediations",
      "api/v1/deviceGroups",
    ];
    const markdown = routes
      .map(
        (route) =>
          `[Real](/${route}/valid) [Again](/${route}/valid) [Missing](/${route}/missing)`,
      )
      .join("\n");
    const result = await makeWriteReportTool("user", "thread").invoke({
      markdown,
    });
    const saved = vi.mocked(prisma.chatThread.updateMany).mock.calls[0][0];
    expect(saved.where).toEqual({ id: "thread", userId: "user" });
    for (const route of routes) {
      expect(saved.data.report).toContain(`[Real](/${route}/valid)`);
      expect(saved.data.report).toContain(`[Again](/${route}/valid) Missing`);
    }
    for (const model of [
      prisma.asset,
      prisma.vulnerability,
      prisma.remediation,
      prisma.deviceGroup,
    ]) {
      expect(model.findMany).toHaveBeenCalledExactlyOnceWith({
        where: { id: { in: ["valid", "missing"] } },
        select: { id: true },
      });
    }
    expect(result).toContain("Report saved");
    expect(result).not.toContain(markdown);
  });

  it("preserves other links and skips lookups when no citations need validation", async () => {
    const markdown = "See [docs](https://example.com) and [reports](/reports).";
    await makeWriteReportTool("user", "thread").invoke({ markdown });
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
    expect(prisma.chatThread.updateMany).toHaveBeenCalledWith({
      where: { id: "thread", userId: "user" },
      data: { report: markdown },
    });
  });

  it("does not overwrite an existing report with empty content", async () => {
    await makeWriteReportTool("user", "thread").invoke({ markdown: "  " });
    expect(prisma.chatThread.updateMany).not.toHaveBeenCalled();
  });

  it("validates titled and reference citations without rewriting code examples", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([]);
    const markdown =
      '[**Missing**](/assets/missing "Device") and [Missing][device].\n\n[device]: /assets/missing\n\n`[Example](/assets/example)`';
    await makeWriteReportTool("user", "thread").invoke({ markdown });
    expect(prisma.chatThread.updateMany).toHaveBeenCalledWith({
      where: { id: "thread", userId: "user" },
      data: {
        report:
          "**Missing** and Missing.\n\n[device]: /assets/missing\n\n`[Example](/assets/example)`",
      },
    });
    expect(prisma.asset.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ["missing"] } },
      select: { id: true },
    });
  });

  it("does not report success when the thread is missing or belongs to another user", async () => {
    vi.mocked(prisma.chatThread.updateMany).mockResolvedValue({ count: 0 });
    const result = await makeWriteReportTool("user", "thread").invoke({
      markdown: "Report",
    });
    expect(result).toContain("Could not save");
  });
});
