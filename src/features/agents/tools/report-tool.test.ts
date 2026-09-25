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

const mockReport = (content: string | null) =>
  vi.mocked(prisma.chatThread.findFirst).mockResolvedValue({
    report: content === null ? null : { id: "r1", content },
  } as never);
const run = (
  make: (userId: string, threadId: string) => { invoke: (i: never) => unknown },
  input: object,
) => make("user", "thread").invoke(input as never) as Promise<string>;
const edit = (oldText: string, newText: string) =>
  run(makeEditReportTool, { oldText, newText });

describe("search_report / read_report", () => {
  const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1} needle`);

  it("search returns at most 5 line-numbered, clipped matches", async () => {
    mockReport(`${"a".repeat(5000)} NEEDLE\n${lines.join("\n")}`);
    const out = await run(makeSearchReportTool, { query: "needle" });
    expect(out.split("\n")).toHaveLength(5);
    expect(out.length).toBeLessThan(700);
  });

  it("read is bounded, pages on, and clips an oversized line", async () => {
    mockReport(lines.join("\n"));
    const first = await run(makeReadReportTool, {});
    expect(first).toContain("200\tline 200");
    expect(first).not.toContain("line 201");
    expect(first).toContain("continue at 201");

    mockReport(`${"x".repeat(10000)}\nnext`);
    const clipped = await run(makeReadReportTool, {});
    expect(clipped.length).toBeLessThan(6100);
    expect(clipped).toContain("[Lines 1-1 of 2; continue at 2]");
  });

  it("a missing or empty report reads as no report", async () => {
    for (const content of [null, ""]) {
      mockReport(content);
      expect(await run(makeReadReportTool, {})).toContain("No report");
      expect(await edit("a", "b")).toContain("write_report");
    }
  });
});

describe("edit_report", () => {
  it("replaces one match in a long report and touches nothing else", async () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `Device ${i} is ok.`);
    lines[4321] = "ICU-14 runs firmware 3.2.";
    const current = lines.join("\n");
    mockReport(current);
    vi.mocked(prisma.chatReport.updateMany).mockResolvedValue({ count: 1 });

    expect(await edit("firmware 3.2.", "firmware 3.4.")).toBe("Replaced.");
    expect(prisma.chatReport.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "r1", content: current },
      data: { content: current.replace("3.2.", "3.4.") },
    });
  });

  it("rejects duplicate, missing and stale edits", async () => {
    mockReport("a b\n\na b\n\nc");
    expect(await edit("a b", "x")).toContain("more than one");
    expect(await edit("zzz", "x")).toContain("not found");
    expect(prisma.chatReport.updateMany).not.toHaveBeenCalled();

    vi.mocked(prisma.chatReport.updateMany).mockResolvedValue({ count: 0 });
    expect(await edit("c", "x")).toContain("changed during the edit");
  });
});
