// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/db";
import {
  makeEditReportTool,
  makeReadReportTool,
  makeSearchReportTool,
  makeWriteReportTool,
} from "./report-tool";

vi.mock("@/lib/db", () => ({
  default: {
    asset: { findMany: vi.fn() },
    vulnerability: { findMany: vi.fn() },
    remediation: { findMany: vi.fn() },
    deviceGroup: { findMany: vi.fn() },
    chatThread: { findFirst: vi.fn(), update: vi.fn() },
    chatReport: { updateMany: vi.fn() },
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.chatThread.findFirst).mockResolvedValue({
    id: "thread",
  } as never);
});

/** The {title, content} handed to the nested ChatReport upsert. */
const saved = () =>
  (
    vi.mocked(prisma.chatThread.update).mock.calls[0]?.[0] as
      | {
          data: {
            report: { upsert: { create: { title: string; content: string } } };
          };
        }
      | undefined
  )?.data.report.upsert.create;

describe("write_report", () => {
  it("batch-validates all four citation types and saves the full report", async () => {
    for (const model of [
      prisma.asset,
      prisma.vulnerability,
      prisma.remediation,
      prisma.deviceGroup,
    ]) {
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
      title: "Batch Report",
      markdown,
    });
    expect(prisma.chatThread.findFirst).toHaveBeenCalledWith({
      where: { id: "thread", userId: "user" },
      select: { id: true },
    });
    const { content } = saved()!;
    for (const route of routes) {
      expect(content).toContain(`[Real](/${route}/valid)`);
      expect(content).toContain(`[Again](/${route}/valid) Missing`);
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

  it("saves title and content through a nested ChatReport upsert (create or update the same values)", async () => {
    const markdown = "See [docs](https://example.com) and [reports](/reports).";
    await makeWriteReportTool("user", "thread").invoke({
      title: "Doc Links",
      markdown,
    });
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
    expect(prisma.chatThread.update).toHaveBeenCalledWith({
      where: { id: "thread" },
      data: {
        report: {
          upsert: {
            create: { title: "Doc Links", content: markdown },
            update: { title: "Doc Links", content: markdown },
          },
        },
      },
      select: { id: true },
    });
  });

  it("does not overwrite an existing report with empty content", async () => {
    await makeWriteReportTool("user", "thread").invoke({
      title: "Empty",
      markdown: "  ",
    });
    expect(prisma.chatThread.findFirst).not.toHaveBeenCalled();
    expect(prisma.chatThread.update).not.toHaveBeenCalled();
  });

  it("validates titled and reference citations without rewriting code examples", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([]);
    const markdown =
      '[**Missing**](/assets/missing "Device") and [Missing][device].\n\n[device]: /assets/missing\n\n`[Example](/assets/example)`';
    await makeWriteReportTool("user", "thread").invoke({
      title: "Citations",
      markdown,
    });
    expect(saved()!.content).toBe(
      "**Missing** and Missing.\n\n[device]: /assets/missing\n\n`[Example](/assets/example)`",
    );
    expect(prisma.asset.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ["missing"] } },
      select: { id: true },
    });
  });

  it("does not report success when the thread is missing or belongs to another user", async () => {
    vi.mocked(prisma.chatThread.findFirst).mockResolvedValue(null as never);
    const result = await makeWriteReportTool("user", "thread").invoke({
      title: "Report",
      markdown: "Report",
    });
    expect(result).toContain("Could not save");
  });
});

function mockReport(content: string | null) {
  vi.mocked(prisma.chatThread.findFirst).mockResolvedValue({
    report: content === null ? null : { id: "r1", content },
  } as never);
}

describe("search_report", () => {
  it("says so when there is no report yet", async () => {
    mockReport(null);
    const result = await makeSearchReportTool("user", "thread").invoke({
      query: "MRI",
    });
    expect(result).toContain("No report has been saved");
  });

  it("returns line numbers and bounded excerpts, capped at 5 matches", async () => {
    const lines = Array.from(
      { length: 8 },
      (_, i) => `Line ${i} mentions MRI.`,
    );
    mockReport(lines.join("\n"));
    const result = await makeSearchReportTool("user", "thread").invoke({
      query: "mentions",
    });
    expect(
      result.split("\n").filter((l) => l.startsWith("Line ")),
    ).toHaveLength(5);
    expect(result).toContain("Line 1:");
    expect(result).toContain("3 more");
  });

  it("clips a very long line around the match", async () => {
    mockReport(`${"a".repeat(5000)} NEEDLE ${"b".repeat(5000)}`);
    const result = await makeSearchReportTool("user", "thread").invoke({
      query: "needle",
    });
    expect(result).toContain("NEEDLE");
    expect(result.length).toBeLessThan(300);
  });

  it("reports no matches", async () => {
    mockReport("Nothing relevant here.");
    const result = await makeSearchReportTool("user", "thread").invoke({
      query: "ventilator",
    });
    expect(result).toBe('No matches for "ventilator" in the report.');
  });
});

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

  it("caps output size even when lines are huge", async () => {
    mockReport(Array.from({ length: 50 }, () => "x".repeat(2000)).join("\n"));
    const result = await makeReadReportTool("user", "thread").invoke({});
    expect(result.length).toBeLessThan(6500);
    expect(result).toContain("to continue");
  });
});

describe("edit_report", () => {
  it("replaces a unique match atomically and leaves the rest untouched", async () => {
    const current = "# Report\n\nFirmware is 1.2.\n\nUnrelated paragraph.";
    mockReport(current);
    vi.mocked(prisma.chatReport.updateMany).mockResolvedValue({ count: 1 });
    const result = await makeEditReportTool("user", "thread").invoke({
      oldText: "Firmware is 1.2.",
      newText: "Firmware is 1.3.",
    });
    expect(prisma.chatReport.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "r1", content: current },
      data: { content: "# Report\n\nFirmware is 1.3.\n\nUnrelated paragraph." },
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
    expect(prisma.chatReport.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a missing target with an actionable error", async () => {
    mockReport("Nothing to see here.");
    const result = await makeEditReportTool("user", "thread").invoke({
      oldText: "Firmware is 1.2.",
      newText: "Firmware is 1.3.",
    });
    expect(result).toContain("Could not find that exact text");
    expect(prisma.chatReport.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a stale edit when the report changed since it was read", async () => {
    mockReport("Firmware is 1.2.");
    vi.mocked(prisma.chatReport.updateMany).mockResolvedValue({ count: 0 });
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
    expect(prisma.chatReport.updateMany).not.toHaveBeenCalled();
  });

  it("edits a long report with bounded reads and a tiny result", async () => {
    const lines = Array.from(
      { length: 5000 },
      (_, i) => `Device SYN-${i} runs firmware 1.${i % 10}.`,
    );
    lines[4321] = "ICU-VITALS-014 runs firmware 3.2.";
    const current = lines.join("\n");
    mockReport(current);
    vi.mocked(prisma.chatReport.updateMany).mockResolvedValue({ count: 1 });

    const found = await makeSearchReportTool("user", "thread").invoke({
      query: "ICU-VITALS-014",
    });
    expect(found).toContain("Line 4322:");
    const read = await makeReadReportTool("user", "thread").invoke({
      startLine: 4322,
    });
    const edited = await makeEditReportTool("user", "thread").invoke({
      oldText: "ICU-VITALS-014 runs firmware 3.2.",
      newText: "ICU-VITALS-014 runs firmware 3.4.",
    });

    for (const out of [found, read]) {
      expect(out.length).toBeLessThan(current.length / 5);
    }
    expect(edited).toBe("Replaced.");
    const { data } = vi.mocked(prisma.chatReport.updateMany).mock.calls[0][0];
    expect(data.content).toBe(
      current.replace("firmware 3.2.", "firmware 3.4."),
    );
  });
});
