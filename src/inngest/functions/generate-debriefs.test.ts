// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockScout, mockWriter, mockClaim } = vi.hoisted(() => ({
  mockPrisma: {
    department: { findMany: vi.fn(), findUnique: vi.fn() },
    debrief: { findFirst: vi.fn(), update: vi.fn() },
    workOrderTicket: { findMany: vi.fn() },
  },
  mockScout: vi.fn(),
  mockWriter: vi.fn(),
  mockClaim: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/features/agents/debrief/scout", () => ({
  runDebriefScout: mockScout,
}));
vi.mock("@/features/agents/debrief/writer", () => ({
  writeDepartmentDebrief: mockWriter,
}));
vi.mock("@/features/debrief/server/runs", () => ({
  claimDebriefRun: mockClaim,
  parseBullets: (raw: unknown) => (Array.isArray(raw) ? raw : []),
}));
vi.mock("../client", () => ({
  inngest: {
    createFunction: (config: unknown, trigger: unknown, handler: unknown) => ({
      config,
      trigger,
      handler,
    }),
  },
}));

import {
  generateAllDebriefs,
  generateDepartmentDebrief,
} from "./generate-debriefs";

/**
 * The mocked `createFunction` returns the raw config/trigger/handler triple
 * instead of an InngestFunction, so the real type does not describe it. Cast
 * once here rather than at every call site.
 */
type MockedFn = {
  config: Record<string, unknown>;
  trigger: Record<string, unknown>;
  // biome-ignore lint/suspicious/noExplicitAny: test harness shim
  handler: (ctx: any) => Promise<any>;
};

const allDebriefs = generateAllDebriefs as unknown as MockedFn;
const deptDebrief = generateDepartmentDebrief as unknown as MockedFn;

/** Minimal Inngest step shim: run callbacks inline, record sent events. */
function makeStep() {
  const sent: unknown[] = [];
  return {
    sent,
    step: {
      run: async (_name: string, fn: () => unknown) => fn(),
      sendEvent: async (_name: string, events: unknown) => {
        sent.push(events);
      },
    },
    logger: { info: vi.fn(), error: vi.fn() },
  };
}

const BULLET = { text: "One thing.", links: [] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateAllDebriefs — the daily cron", () => {
  it("runs at 05:00, after the 02:00 vulnerability enrichment", () => {
    // The scout reads enriched EPSS/KEV data, so ordering against that job
    // is the reason for the hour, not an arbitrary choice.
    expect(allDebriefs.trigger).toEqual({ cron: "0 5 * * *" });
  });

  it("does nothing when no department has users", async () => {
    mockPrisma.department.findMany.mockResolvedValue([]);
    const { step, logger, sent } = makeStep();

    const result = await allDebriefs.handler({ step, logger });

    expect(result).toEqual({ departmentCount: 0 });
    // The expensive half must not run when there is nobody to read the output.
    expect(mockScout).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("surveys once and fans out one event per department", async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      { id: "d1", name: "Biomed" },
      { id: "d2", name: "Nursing" },
    ]);
    mockScout.mockResolvedValue("findings text");
    mockClaim
      .mockResolvedValueOnce({ id: "run-1", created: true })
      .mockResolvedValueOnce({ id: "run-2", created: true });
    const { step, logger, sent } = makeStep();

    const result = await allDebriefs.handler({ step, logger });

    // One survey shared by every department — that is why the split exists.
    expect(mockScout).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ departmentCount: 2, skipped: 0 });

    const events = sent[0] as { data: Record<string, unknown> }[];
    expect(events).toHaveLength(2);
    expect(events[0].data).toMatchObject({
      debriefId: "run-1",
      departmentId: "d1",
      findings: "findings text",
      key: "run-1",
    });
  });

  it("skips a department whose previous run is still active", async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      { id: "d1", name: "Biomed" },
      { id: "d2", name: "Nursing" },
    ]);
    mockScout.mockResolvedValue("findings");
    mockClaim
      .mockResolvedValueOnce({ id: "run-1", created: true })
      .mockResolvedValueOnce({ id: "stuck", created: false });
    const { step, logger, sent } = makeStep();

    const result = await allDebriefs.handler({ step, logger });

    expect(result).toEqual({ departmentCount: 1, skipped: 1 });
    expect(sent[0]).toHaveLength(1);
  });

  it("does not fan out when the scout fails", async () => {
    // A failed survey must cost nothing, not N writer calls with no input.
    mockPrisma.department.findMany.mockResolvedValue([{ id: "d1", name: "X" }]);
    mockScout.mockRejectedValue(
      new Error("Debrief scout returned no findings"),
    );
    const { step, logger, sent } = makeStep();

    await expect(allDebriefs.handler({ step, logger })).rejects.toThrow(
      /no findings/,
    );
    expect(mockClaim).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});

describe("generateDepartmentDebrief — writing one department's brief", () => {
  const event = (data: Record<string, unknown>) => ({
    data: { debriefId: "run-1", departmentId: "d1", ...data },
  });

  function contextResolves(previousBullets: unknown[] = []) {
    mockPrisma.department.findUnique.mockResolvedValue({
      name: "Biomed",
      description: "Services clinical devices.",
    });
    mockPrisma.debrief.findFirst.mockResolvedValue(
      previousBullets.length ? { bullets: previousBullets } : null,
    );
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([
      { summary: "Replace line sets", status: "TO_DO" },
    ]);
    mockPrisma.debrief.update.mockResolvedValue({ id: "run-1" });
  }

  it("is keyed for idempotency and serialised per department", () => {
    // Two runs for one department must not interleave their writes, and a
    // duplicated event must not trigger a second agent call.
    expect(deptDebrief.config).toMatchObject({
      idempotency: "event.data.key",
      concurrency: { key: "event.data.departmentId", limit: 1 },
    });
  });

  it("writes Ready with the bullets and the model that produced them", async () => {
    contextResolves();
    mockWriter.mockResolvedValue({
      bullets: [BULLET],
      model: "claude-sonnet-5",
    });
    const { step, logger } = makeStep();

    const result = await deptDebrief.handler({
      event: event({ findings: "shared findings" }),
      step,
      logger,
    });

    expect(result).toMatchObject({ status: "Ready", bulletCount: 1 });
    const persisted = mockPrisma.debrief.update.mock.calls.at(-1)?.[0];
    expect(persisted.data).toMatchObject({
      status: "Ready",
      bullets: [BULLET],
      model: "claude-sonnet-5",
      error: null,
    });
  });

  it("reuses the shared findings instead of surveying again", async () => {
    contextResolves();
    mockWriter.mockResolvedValue({ bullets: [BULLET], model: "m" });
    const { step, logger } = makeStep();

    await deptDebrief.handler({
      event: event({ findings: "shared findings" }),
      step,
      logger,
    });

    expect(mockScout).not.toHaveBeenCalled();
    expect(mockWriter).toHaveBeenCalledWith(
      expect.objectContaining({ findings: "shared findings" }),
    );
  });

  it("surveys for itself on the manual regenerate path", async () => {
    // The button has no fleet-wide survey to share.
    contextResolves();
    mockScout.mockResolvedValue("its own findings");
    mockWriter.mockResolvedValue({ bullets: [BULLET], model: "m" });
    const { step, logger } = makeStep();

    await deptDebrief.handler({ event: event({}), step, logger });

    expect(mockScout).toHaveBeenCalledTimes(1);
    expect(mockWriter).toHaveBeenCalledWith(
      expect.objectContaining({ findings: "its own findings" }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ findingsSource: "scout" }),
    );
  });

  it("passes yesterday's bullets through to the writer", async () => {
    // Exercises the parseBullets branch: every other test leaves the previous
    // debrief null, so the stored-JSON path was never run.
    contextResolves([BULLET]);
    mockWriter.mockResolvedValue({ bullets: [BULLET], model: "m" });
    const { step, logger } = makeStep();

    await deptDebrief.handler({
      event: event({ findings: "f" }),
      step,
      logger,
    });

    expect(mockWriter).toHaveBeenCalledWith(
      expect.objectContaining({ previousBullets: [BULLET] }),
    );
  });

  it("passes an empty previousBullets on a department's first run", async () => {
    contextResolves([]);
    mockWriter.mockResolvedValue({ bullets: [BULLET], model: "m" });
    const { step, logger } = makeStep();

    await deptDebrief.handler({
      event: event({ findings: "f" }),
      step,
      logger,
    });

    expect(mockWriter).toHaveBeenCalledWith(
      expect.objectContaining({ previousBullets: [] }),
    );
  });

  it("clears the previous run's bullets when marking Failed", async () => {
    // A Failed row must not keep the bullets of an earlier Ready run, or the
    // card renders stale content under a failure state.
    contextResolves();
    mockWriter.mockResolvedValue({ bullets: [], model: "m" });
    const { step, logger } = makeStep();

    await deptDebrief.handler({
      event: event({ findings: "f" }),
      step,
      logger,
    });

    const persisted = mockPrisma.debrief.update.mock.calls.at(-1)?.[0];
    expect(persisted.data).toMatchObject({ status: "Failed", bullets: [] });
  });

  it("marks Failed rather than Ready when every bullet collapsed", async () => {
    // Ready with no bullets renders an empty card.
    contextResolves();
    mockWriter.mockResolvedValue({ bullets: [], model: "m" });
    const { step, logger } = makeStep();

    const result = await deptDebrief.handler({
      event: event({ findings: "f" }),
      step,
      logger,
    });

    expect(result).toMatchObject({ status: "Failed", bulletCount: 0 });
    const persisted = mockPrisma.debrief.update.mock.calls.at(-1)?.[0];
    expect(persisted.data.status).toBe("Failed");
  });

  it("never leaves a row stuck on Generating when the writer throws", async () => {
    // A stuck row blocks the department until the staleness bound expires.
    contextResolves();
    mockWriter.mockRejectedValue(new Error("model refused"));
    const { step, logger } = makeStep();

    await expect(
      deptDebrief.handler({ event: event({ findings: "f" }), step, logger }),
    ).rejects.toThrow("model refused");

    const persisted = mockPrisma.debrief.update.mock.calls.at(-1)?.[0];
    expect(persisted.data).toMatchObject({
      status: "Failed",
      error: "model refused",
    });
  });
});

describe("generateDepartmentDebrief — progress and failure reporting", () => {
  const event = (data: Record<string, unknown>) => ({
    data: { debriefId: "run-1", departmentId: "d1", ...data },
  });

  function contextResolves() {
    mockPrisma.department.findUnique.mockResolvedValue({
      name: "Biomed",
      description: null,
    });
    mockPrisma.debrief.findFirst.mockResolvedValue(null);
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([]);
    mockPrisma.debrief.update.mockResolvedValue({ id: "run-1" });
  }

  it("beats before the scout, not only after it", async () => {
    // The staleness bound reads updatedAt. A touch that lands only after a
    // multi-minute scout measures age, not progress, and a second click
    // meanwhile opens a duplicate run that pays for its own scout and writer.
    contextResolves();
    const order: string[] = [];
    mockScout.mockImplementation(async () => {
      order.push("scout");
      return "findings";
    });
    mockPrisma.debrief.update.mockImplementation(
      async (args: { data: { status?: string } }) => {
        if (args.data.status === "Generating") order.push("beat");
        return { id: "run-1" };
      },
    );
    mockWriter.mockResolvedValue({ bullets: [BULLET], model: "m" });
    const { step, logger } = makeStep();

    await deptDebrief.handler({ event: event({}), step, logger });

    expect(order.indexOf("beat")).toBeLessThan(order.indexOf("scout"));
  });

  it("surfaces the real error when the row was deleted mid-run", async () => {
    // A department deleted mid-run cascades to its debriefs, so the mark-failed
    // update throws P2025. That must not replace the cause with "record not
    // found".
    contextResolves();
    mockWriter.mockRejectedValue(new Error("model refused"));
    mockPrisma.debrief.update.mockImplementation(
      async (args: { data: { status?: string } }) => {
        if (args.data.status === "Failed") {
          throw new Error(
            "An operation failed because it depends on one or more records that were required but not found",
          );
        }
        return { id: "run-1" };
      },
    );
    const { step, logger } = makeStep();

    await expect(
      deptDebrief.handler({ event: event({ findings: "f" }), step, logger }),
    ).rejects.toThrow("model refused");
  });
});

describe("generateDepartmentDebrief — run outcome logging", () => {
  const event = (data: Record<string, unknown>) => ({
    data: { debriefId: "run-1", departmentId: "d1", ...data },
  });

  function contextResolves() {
    mockPrisma.department.findUnique.mockResolvedValue({
      name: "Biomed",
      description: null,
    });
    mockPrisma.debrief.findFirst.mockResolvedValue(null);
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([]);
    mockPrisma.debrief.update.mockResolvedValue({ id: "run-1" });
  }

  it("logs the terminal outcome with ids, status and count", async () => {
    contextResolves();
    mockWriter.mockResolvedValue({ bullets: [BULLET], model: "m" });
    const { step, logger } = makeStep();

    await deptDebrief.handler({
      event: event({ findings: "f" }),
      step,
      logger,
    });

    expect(logger.info).toHaveBeenCalledWith("Debrief run finished", {
      debriefId: "run-1",
      departmentId: "d1",
      bulletCount: 1,
      status: "Ready",
      findingsSource: "event",
    });
  });

  it("never puts bullet text in the logs", async () => {
    // Bullets are clinical content about a named hospital. Counts and ids are
    // enough to trace a run.
    contextResolves();
    mockWriter.mockResolvedValue({ bullets: [BULLET], model: "m" });
    const { step, logger } = makeStep();

    await deptDebrief.handler({
      event: event({ findings: "f" }),
      step,
      logger,
    });

    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).not.toContain(BULLET.text);
  });

  it("logs a failure with its cause before rethrowing", async () => {
    contextResolves();
    mockWriter.mockRejectedValue(new Error("model refused"));
    const { step, logger } = makeStep();

    await expect(
      deptDebrief.handler({ event: event({ findings: "f" }), step, logger }),
    ).rejects.toThrow("model refused");

    expect(logger.error).toHaveBeenCalledWith(
      "Debrief run failed",
      expect.objectContaining({
        debriefId: "run-1",
        departmentId: "d1",
        status: "Failed",
        error: "model refused",
      }),
    );
  });
});

describe("generateAllDebriefs — connection pressure", () => {
  it("claims departments one at a time, not all at once", async () => {
    // Each claim opens a Prisma interactive transaction, which holds a pool
    // connection for its lifetime. Claiming in parallel needs as many
    // connections as there are departments; past the pool size (2 x cpus + 1)
    // the surplus fail on maxWait and take the whole nightly fan-out with them.
    const departments = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`,
      name: `Dept ${i}`,
    }));
    mockPrisma.department.findMany.mockResolvedValue(departments);
    mockScout.mockResolvedValue("findings");

    let inFlight = 0;
    let peak = 0;
    mockClaim.mockImplementation(async (departmentId: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      // Yield, so genuinely parallel callers would overlap here.
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      return { id: `run-${departmentId}`, created: true };
    });

    const { step, logger } = makeStep();
    await allDebriefs.handler({ step, logger });

    expect(mockClaim).toHaveBeenCalledTimes(12);
    expect(peak).toBe(1);
  });
});
