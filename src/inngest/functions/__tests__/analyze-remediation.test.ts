// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, writes } = vi.hoisted(() => {
  const writes: string[] = [];
  const mockPrisma = {
    remediation: { findUnique: vi.fn() },
    sourceRecord: { findUnique: vi.fn(), create: vi.fn() },
    notification: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(mockPrisma),
    ),
  };
  return { mockPrisma, writes };
});
vi.mock("@/lib/db", () => ({ default: mockPrisma }));

// The Inngest client pulls in the whole event-schema graph; the function under
// test only needs `createFunction` to hand back its handler.
vi.mock("../../client", () => ({
  inngest: {
    createFunction: (
      _config: unknown,
      _trigger: unknown,
      // biome-ignore lint/suspicious/noExplicitAny: the handler is what we exercise
      handler: any,
    ) => handler,
  },
}));

const { mockVex, mockTriage, mockPersistTriage, mockMitigation, mockQuestion } =
  vi.hoisted(() => ({
    mockVex: vi.fn(),
    mockTriage: vi.fn(),
    mockPersistTriage: vi.fn(),
    mockMitigation: vi.fn(),
    mockQuestion: vi.fn(),
  }));
vi.mock("@/features/inbox/agent/vex", () => ({
  sortNotificationVulnerabilities: mockVex,
}));
vi.mock("@/features/inbox/agent/triage", () => ({
  triageNotification: mockTriage,
}));
vi.mock("@/features/inbox/agent/triage/persist", () => ({
  persistTriageResult: mockPersistTriage,
}));
vi.mock("@/features/inbox/agent/mitigation/persist", () => ({
  persistMitigationPlans: mockMitigation,
}));
vi.mock("@/features/inbox/agent/question", () => ({
  generateQuestionForNotification: mockQuestion,
}));

const { analyzeRemediation } = await import("../analyze-remediation");

// biome-ignore lint/suspicious/noExplicitAny: Inngest's step tools are stubbed
const step: any = { run: <T>(_id: string, fn: () => Promise<T>) => fn() };

const run = () =>
  // biome-ignore lint/suspicious/noExplicitAny: the handler takes Inngest's full ctx
  (analyzeRemediation as any)({
    event: { data: { remediationId: "rem-1" } },
    step,
  });

beforeEach(() => {
  vi.clearAllMocks();
  writes.length = 0;
  mockPrisma.remediation.findUnique.mockResolvedValue({
    description: "Apply firmware 2.1",
    narrative: null,
    vulnerabilities: [
      { id: "vuln-1", displayId: "CVE-2026-0001" },
      { id: "vuln-2", displayId: "CVE-2026-0002" },
    ],
  });
  mockPrisma.sourceRecord.findUnique.mockResolvedValue(null);
  mockPrisma.sourceRecord.create.mockImplementation(async () => {
    writes.push("sourceRecord");
    return { id: "src-1" };
  });
  mockPrisma.notification.create.mockImplementation(async () => {
    writes.push("notification");
    return { id: "notif-1" };
  });
  mockVex.mockResolvedValue({ sorted: 2 });
  mockTriage.mockResolvedValue({ priority: "High" });
  mockMitigation.mockResolvedValue(null);
  mockQuestion.mockResolvedValue({ asked: 0 });
});

describe("a new TA4 submission", () => {
  it("creates the record and what it names before the notification", async () => {
    await run();

    expect(writes).toEqual(["sourceRecord", "notification"]);
  });

  it("links the vulnerabilities and the remediation with no confidence, as stated facts", async () => {
    await run();

    const { data } = mockPrisma.sourceRecord.create.mock.calls[0][0];
    expect(data.vulnerabilities).toEqual({
      create: [{ vulnerabilityId: "vuln-1" }, { vulnerabilityId: "vuln-2" }],
    });
    expect(data.remediations).toEqual({ create: { remediationId: "rem-1" } });
    expect(data).not.toHaveProperty("remediationId");
  });

  it("links the notification to the record as its source", async () => {
    const result = await run();

    expect(mockPrisma.notification.create.mock.calls[0][0]).toEqual({
      data: {
        type: "UpdateAvailable",
        title: "Update available for CVE-2026-0001 and 1 more",
        summary: "Apply firmware 2.1",
        sourceLinks: {
          create: { sourceRecordId: "src-1", sourceType: "Source" },
        },
      },
    });
    expect(result).toMatchObject({
      notificationId: "notif-1",
      sourceId: "src-1",
    });
  });
});

describe("a submission seen before", () => {
  it("reuses its notification and writes nothing", async () => {
    mockPrisma.sourceRecord.findUnique.mockResolvedValue({
      id: "src-old",
      links: [{ notificationId: "notif-old" }],
    });

    const result = await run();

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      notificationId: "notif-old",
      sourceId: "src-old",
    });
  });
});

describe("a remediation with no vulnerability", () => {
  it("is skipped", async () => {
    mockPrisma.remediation.findUnique.mockResolvedValue({
      description: null,
      narrative: null,
      vulnerabilities: [],
    });

    const result = await run();

    expect(result).toEqual({
      skipped: "no-vulnerability",
      remediationId: "rem-1",
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
