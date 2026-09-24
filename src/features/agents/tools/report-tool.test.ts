// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/db";
import {
  makeEditReportTool,
  makeReadReportTool,
  makeWriteReportTool,
} from "./report-tool";

vi.mock("@/lib/db", () => ({
  default: {
    asset: { findMany: vi.fn() },
    vulnerability: { findMany: vi.fn() },
    remediation: { findMany: vi.fn() },
    deviceGroup: { findMany: vi.fn() },
    chatThread: { updateMany: vi.fn(), findFirst: vi.fn() },
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

function mockReport(report: string | null) {
  vi.mocked(prisma.chatThread.findFirst).mockResolvedValue(
    report === null ? null : ({ report } as never),
  );
}

describe("read_report", () => {
  it("returns a bounded, line-numbered range with continuation info", async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`);
    mockReport(lines.join("\n"));
    const result = await makeReadReportTool("user", "thread").invoke({});
    expect(result).toContain("1\tline 1");
    expect(result).toContain("200\tline 200");
    expect(result).not.toContain("201\tline 201");
    expect(result).toContain(
      "[Showing lines 1-200 of 500. Call read_report again with startLine: 201 to continue.]",
    );
  });

  it("continues from a given startLine and signals the end", async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    mockReport(lines.join("\n"));
    const result = await makeReadReportTool("user", "thread").invoke({
      startLine: 8,
    });
    expect(result).toContain("8\tline 8");
    expect(result).toContain("10\tline 10");
    expect(result).toContain("[Showing lines 8-10 of 10.]");
    expect(result).not.toContain("to continue");
  });
});

describe("edit_report", () => {
  it("replaces a unique match atomically and leaves the rest untouched", async () => {
    const current = "# Report\n\nFirmware is 1.2.\n\nUnrelated paragraph.";
    mockReport(current);
    const result = await makeEditReportTool("user", "thread").invoke({
      oldText: "Firmware is 1.2.",
      newText: "Firmware is 1.3.",
    });
    expect(prisma.chatThread.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "thread", userId: "user", report: current },
      data: {
        report: "# Report\n\nFirmware is 1.3.\n\nUnrelated paragraph.",
      },
    });
    expect(result).toBe("Replaced.");
  });

  it("rejects an ambiguous target instead of guessing", async () => {
    mockReport("Status: pending.\n\nStatus: pending.\n\nOther text.");
    const result = await makeEditReportTool("user", "thread").invoke({
      oldText: "Status: pending.",
      newText: "Status: done.",
    });
    expect(result).toContain("matches more than one place");
    expect(prisma.chatThread.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a missing target with an actionable error", async () => {
    mockReport("Nothing to see here.");
    const result = await makeEditReportTool("user", "thread").invoke({
      oldText: "Firmware is 1.2.",
      newText: "Firmware is 1.3.",
    });
    expect(result).toContain("Could not find that exact text");
    expect(prisma.chatThread.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a stale edit when the report changed since it was read", async () => {
    mockReport("Firmware is 1.2.");
    vi.mocked(prisma.chatThread.updateMany).mockResolvedValue({ count: 0 });
    const result = await makeEditReportTool("user", "thread").invoke({
      oldText: "Firmware is 1.2.",
      newText: "Firmware is 1.3.",
    });
    expect(result).toContain("changed since you read it");
  });

  it("points to write_report when there is no report yet", async () => {
    mockReport(null);
    const result = await makeEditReportTool("user", "thread").invoke({
      oldText: "anything",
      newText: "else",
    });
    expect(result).toContain("use write_report to create one");
    expect(prisma.chatThread.updateMany).not.toHaveBeenCalled();
  });
});
