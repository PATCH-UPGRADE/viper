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
    chatThread: { findFirst: vi.fn(), update: vi.fn() },
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
