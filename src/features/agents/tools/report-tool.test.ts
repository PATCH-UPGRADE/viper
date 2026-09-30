// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/db";
import type { Retrieval } from "./query-platform-tool";
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
    workflow: { findMany: vi.fn() },
    notification: { findMany: vi.fn() },
    chatMessage: { findMany: vi.fn() },
    chatThread: { findFirst: vi.fn(), update: vi.fn() },
    chatReport: { updateMany: vi.fn() },
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([]);
  vi.mocked(prisma.asset.findMany).mockResolvedValue([]);
  vi.mocked(prisma.vulnerability.findMany).mockResolvedValue([]);
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
  const models = [
    prisma.asset,
    prisma.vulnerability,
    prisma.remediation,
    prisma.deviceGroup,
    prisma.workflow,
    prisma.notification,
  ];

  it("batch-validates all six citation types and refuses a missing record", async () => {
    for (const model of models) {
      // Then the Sources lookup, which finds no named records.
      model.findMany = vi
        .fn()
        .mockResolvedValueOnce([{ id: "valid" }])
        .mockResolvedValue([]);
    }
    const routes = [
      "assets",
      "vulnerabilities",
      "remediations",
      "api/v1/deviceGroups",
      "workflows",
      "inbox",
    ];
    const markdown = routes
      .map(
        (route) =>
          `[Real](/${route}/valid) [Again](/${route}/valid) [Missing](/${route}/missing)`,
      )
      .join("\n");
    await expect(
      run(
        makeWriteReportTool,
        { title: "Batch Report", markdown },
        new Set(["valid", "missing"]),
      ),
    ).rejects.toThrow(routes.map((route) => `/${route}/missing`).join(", "));
    for (const model of models) {
      expect(model.findMany).toHaveBeenNthCalledWith(1, {
        where: { id: { in: ["valid", "missing"] } },
        select: { id: true },
      });
    }

    for (const model of models)
      vi.mocked(model.findMany).mockResolvedValueOnce([
        { id: "valid" },
      ] as never);
    const good = markdown.replace(/ \[Missing\]\([^)]*\)/g, "");
    const result = await run(
      makeWriteReportTool,
      { title: "Batch Report", markdown: good },
      new Set(["valid"]),
    );
    expect(prisma.chatThread.findFirst).toHaveBeenCalledWith({
      where: { id: "thread", userId: "user" },
      select: { id: true },
    });
    expect(saved()!.content).toBe(good);
    expect(result).toContain("Report saved");
    expect(result).not.toContain(good);
  });

  it("saves title and content through a nested ChatReport upsert (create or update the same values)", async () => {
    const markdown = "See [docs](https://example.com) and [reports](/reports).";
    await run(makeWriteReportTool, {
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
    await run(makeWriteReportTool, {
      title: "Empty",
      markdown: "  ",
    });
    expect(prisma.chatThread.findFirst).not.toHaveBeenCalled();
    expect(prisma.chatThread.update).not.toHaveBeenCalled();
  });

  it("checks titled and reference citations but not code examples", async () => {
    const markdown =
      '[**Missing**](/assets/missing "Device") and [Missing][device].\n\n[device]: /assets/missing\n\n`[Example](/assets/example)`';
    await expect(
      run(
        makeWriteReportTool,
        { title: "Citations", markdown },
        new Set(["missing"]),
      ),
    ).rejects.toThrow("drop the links: /assets/missing, /assets/missing");
    expect(prisma.asset.findMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ["missing"] } },
      select: { id: true },
    });
  });

  it("does not report success when the thread is missing or belongs to another user", async () => {
    vi.mocked(prisma.chatThread.findFirst).mockResolvedValue(null as never);
    const result = await run(makeWriteReportTool, {
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
  make: (
    userId: string,
    threadId: string,
    retrieval: Retrieval,
  ) => { invoke: (i: never) => unknown },
  input: object,
  ids = new Set<string>(),
  retrieval: Retrieval = [
    Promise.resolve(JSON.stringify([...ids].map((id) => ({ id })))),
  ],
) =>
  make("user", "thread", retrieval).invoke(input as never) as Promise<string>;
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

describe("citation retrieval check", () => {
  const write = async (markdown: string, retrieved: string[]) => {
    vi.mocked(prisma.chatThread.update).mockClear();
    await run(
      makeWriteReportTool,
      { title: "R", markdown },
      new Set(retrieved),
    );
    return saved()!.content;
  };

  beforeEach(() => {
    // Every cited id exists.
    vi.mocked(prisma.asset.findMany).mockImplementation((async ({
      where,
    }: {
      where: { id: { in: string[] } };
    }) => where.id.in.map((id) => ({ id }))) as never);
  });

  it("keeps citations retrieved this turn or an earlier one, refuses the rest", async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([
      {
        toolCalls: [
          {
            type: "tool-query_platform_data",
            output: { items: [{ id: "x", deviceGroup: { id: "a2" } }] },
          },
        ],
      },
    ] as never);
    expect(await write("[A](/assets/a1) [B](/assets/a2)", ["a1"])).toBe(
      "[A](/assets/a1) [B](/assets/a2)",
    );
    await expect(write("[C](/assets/a3)", ["a1"])).rejects.toThrow(
      "drop the links: /assets/a3",
    );
  });

  it("waits for a lookup still running in parallel", async () => {
    const lookup = new Promise<string>((done) =>
      setTimeout(() => done('{"id":"a1"}'), 20),
    );
    await run(
      makeWriteReportTool,
      { title: "R", markdown: "[A](/assets/a1)" },
      new Set(),
      [lookup],
    );
    expect(saved()!.content).toBe("[A](/assets/a1)");
  });

  it("skips the saved history when this turn's lookups cover every citation", async () => {
    await write("[A](/assets/a1)", ["a1"]);
    await write("No links.", []);
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
  });

  it("keeps a retrieved reference-style citation", async () => {
    expect(await write("[A][r]\n\n[r]: /assets/a2", ["a2"])).toBe(
      "[A][r]\n\n[r]: /assets/a2",
    );
  });

  it("edit_report checks the whole edited report", async () => {
    mockReport("[B](/assets/a2) Old.");
    vi.mocked(prisma.chatReport.updateMany).mockResolvedValue({ count: 1 });
    await run(
      makeEditReportTool,
      { oldText: "Old.", newText: "New." },
      new Set(["a1", "a2"]),
    );
    expect(prisma.chatReport.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", content: "[B](/assets/a2) Old." },
      data: { content: "[B](/assets/a2) New." },
    });

    // Retargeting a link in place is still checked.
    await expect(
      run(
        makeEditReportTool,
        { oldText: "/assets/a2", newText: "/assets/a3" },
        new Set(["a1", "a2"]),
      ),
    ).rejects.toThrow("drop the links: /assets/a3");
  });
});
