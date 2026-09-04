// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    notification: { create: vi.fn(), update: vi.fn() },
    notificationVulnerabilityMapping: { count: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ default: mockPrisma }));

const { mockClassify, mockTriage, mockVex, mockQuestions, mockMitigation } =
  vi.hoisted(() => ({
    mockClassify: vi.fn(),
    mockTriage: vi.fn(),
    mockVex: vi.fn(),
    mockQuestions: vi.fn(),
    mockMitigation: vi.fn(),
  }));
vi.mock("../agent/classify", () => ({ classifyNotification: mockClassify }));
vi.mock("../agent/triage", () => ({ triageNotification: mockTriage }));
vi.mock("../agent/vex", () => ({ sortNotificationVulnerabilities: mockVex }));
vi.mock("../agent/question", () => ({
  generateQuestionForNotification: mockQuestions,
}));
vi.mock("../agent/mitigation/persist", () => ({
  persistMitigationPlans: mockMitigation,
}));

const { runNotificationPipeline } = await import("../pipeline");

// biome-ignore lint/suspicious/noExplicitAny: Inngest's step tools are stubbed
const step: any = { run: <T>(_id: string, fn: () => Promise<T>) => fn() };

const doc = { from: "MedISAO", subject: "An advisory", markdown: "# body" };

const run = (known?: { tlp?: string }) =>
  runNotificationPipeline({
    step,
    sourceId: "src-1",
    doc,
    linkEntities: async () => ({ linked: 0 }),
    // biome-ignore lint/suspicious/noExplicitAny: narrowing Tlp is not the point here
    known: known as any,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockClassify.mockResolvedValue({
    action: "create",
    type: "Advisory",
    title: "An advisory",
    summary: "a summary",
    tlp: null,
  });
  mockPrisma.notification.create.mockResolvedValue({ id: "notif-1" });
  mockPrisma.notification.update.mockResolvedValue({ id: "notif-1" });
  mockPrisma.notificationVulnerabilityMapping.count.mockResolvedValue(0);
  mockTriage.mockResolvedValue({
    priority: "Monitor",
    priorityReasonWhy: "why",
    hospitalImpact: {},
  });
  mockMitigation.mockResolvedValue(null);
});

describe("a marking the source stated", () => {
  it("is stored, where the classifier read none", async () => {
    await run({ tlp: "CLEAR" });

    expect(mockPrisma.notification.create.mock.calls[0][0].data.tlp).toBe(
      "CLEAR",
    );
  });

  it("overrides the classifier, which only inferred it from prose", async () => {
    mockClassify.mockResolvedValue({
      action: "create",
      type: "Advisory",
      title: "An advisory",
      summary: "a summary",
      tlp: "RED",
    });

    await run({ tlp: "CLEAR" });

    expect(mockPrisma.notification.create.mock.calls[0][0].data.tlp).toBe(
      "CLEAR",
    );
  });

  it("is stored when the source updates an advisory we already hold", async () => {
    mockClassify.mockResolvedValue({
      action: "update",
      notificationId: "notif-1",
      type: "Advisory",
      title: "An advisory",
      summary: "a summary",
      tlp: null,
      reasonWhy: "same advisory",
    });

    await run({ tlp: "AMBER" });

    expect(mockPrisma.notification.update.mock.calls[0][0].data.tlp).toBe(
      "AMBER",
    );
  });
});

describe("a source that states nothing", () => {
  it("leaves the classifier's reading in place", async () => {
    mockClassify.mockResolvedValue({
      action: "create",
      type: "Advisory",
      title: "An advisory",
      summary: "a summary",
      tlp: "GREEN",
    });

    await run();

    expect(mockPrisma.notification.create.mock.calls[0][0].data.tlp).toBe(
      "GREEN",
    );
  });

  it("writes no marking when neither the source nor the classifier has one", async () => {
    await run();

    expect(
      mockPrisma.notification.create.mock.calls[0][0].data,
    ).not.toHaveProperty("tlp");
  });
});
