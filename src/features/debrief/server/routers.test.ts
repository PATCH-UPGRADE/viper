// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    debrief: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    // claimDebriefRun takes an advisory lock inside an interactive
    // transaction. Hand the callback the same mock, so assertions on
    // debrief.* still see every call.
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

const { mockRequestDebrief } = vi.hoisted(() => ({
  mockRequestDebrief: vi.fn(),
}));

vi.mock("@/inngest/events/debrief", () => ({
  requestDebrief: mockRequestDebrief,
}));

import { createCallerFactory } from "@/trpc/init";
import { debriefBulletsSchema } from "../types";
import { debriefRouter } from "./routers";

const createCaller = createCallerFactory(debriefRouter);
const caller = createCaller({
  // biome-ignore lint/suspicious/noExplicitAny: test fixture
  auth: { user: { id: "user-test" } } as any,
  // biome-ignore lint/suspicious/noExplicitAny: test fixture
} as any);

const DEPARTMENT = { id: "dept-1", name: "Biomedical Engineering" };

const BULLET = {
  text: "Two dialysis machines run unpatched firmware: {{0}}.",
  links: [
    {
      label: "Nephrotek Renastar bypass",
      entityType: "vulnerability",
      entityId: "vuln-1",
    },
  ],
};

function readyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "debrief-1",
    department: DEPARTMENT,
    status: "Ready",
    bullets: [BULLET],
    since: new Date("2026-08-16T18:20:00.000Z"),
    createdAt: new Date("2026-08-17T11:24:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequestDebrief.mockResolvedValue(true);
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma),
  );
});

describe("debrief.getForMyDepartment", () => {
  /** The two reads the query makes: newest Ready, then newest of any status. */
  const reads = (ready: unknown, latest: unknown) =>
    mockPrisma.debrief.findFirst
      .mockResolvedValueOnce(ready)
      .mockResolvedValueOnce(latest);

  const LATEST = (status: string) => ({
    id: "debrief-latest",
    status,
    department: DEPARTMENT,
  });

  it("returns null when the user belongs to no department", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: null });

    await expect(caller.getForMyDepartment()).resolves.toBeNull();
    expect(mockPrisma.debrief.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when the department has never had a run", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    reads(null, null);

    await expect(caller.getForMyDepartment()).resolves.toBeNull();
  });

  it("returns the newest Ready brief", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    reads(readyRow(), LATEST("Ready"));

    const result = await caller.getForMyDepartment();

    expect(result).toMatchObject({
      department: DEPARTMENT,
      pending: false,
      lastRunFailed: false,
    });
    expect(result?.bullets).toEqual([BULLET]);
  });

  it("asks for the newest Ready run, not just the newest run", async () => {
    // Asserted on the query, not the result: a mocked findFirst returns the
    // same row whatever the filter, so only this catches a dropped status.
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    reads(readyRow(), LATEST("Generating"));

    await caller.getForMyDepartment();

    const [readyQuery] = mockPrisma.debrief.findFirst.mock.calls[0];
    expect(readyQuery.where).toEqual({
      departmentId: "dept-1",
      status: "Ready",
    });
    const [latestQuery] = mockPrisma.debrief.findFirst.mock.calls[1];
    expect(latestQuery.where).toEqual({ departmentId: "dept-1" });
  });

  it("keeps the last Ready brief while a newer run is in flight", async () => {
    // Replacing a good brief with a loading state takes away the answer the
    // reader already had.
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    reads(readyRow(), LATEST("Generating"));

    const result = await caller.getForMyDepartment();

    expect(result?.bullets).toEqual([BULLET]);
    expect(result?.pending).toBe(true);
  });

  it("keeps it when the newest run failed, and reports the failure", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    reads(readyRow(), LATEST("Failed"));

    const result = await caller.getForMyDepartment();

    expect(result?.bullets).toEqual([BULLET]);
    expect(result?.lastRunFailed).toBe(true);
  });

  it("reports a first run with no brief behind it", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    reads(null, LATEST("Generating"));

    const result = await caller.getForMyDepartment();

    expect(result?.bullets).toEqual([]);
    expect(result?.pending).toBe(true);
    expect(result?.generatedAt).toBeNull();
  });

  it("survives a stored row that fails the bullet contract", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    reads(readyRow({ bullets: [{ text: "", links: "no" }] }), LATEST("Ready"));

    const result = await caller.getForMyDepartment();

    expect(result?.bullets).toEqual([]);
  });

  it("never exposes the stored error message", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    reads(null, LATEST("Failed"));

    const result = await caller.getForMyDepartment();

    expect(result).not.toHaveProperty("error");
  });
});

describe("debrief.regenerate", () => {
  it("rejects a caller with no department", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: null });

    await expect(caller.regenerate()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(mockPrisma.debrief.create).not.toHaveBeenCalled();
  });

  it("creates a Generating row carrying the previous run's timestamp", async () => {
    const previousRun = new Date("2026-08-16T18:20:00.000Z");
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst
      .mockResolvedValueOnce(null) // nothing in flight
      .mockResolvedValueOnce({ createdAt: previousRun }); // previous Ready run
    mockPrisma.debrief.create.mockResolvedValue({ id: "debrief-2" });

    await expect(caller.regenerate()).resolves.toEqual({
      id: "debrief-2",
      queued: true,
    });

    expect(mockPrisma.debrief.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          departmentId: "dept-1",
          status: "Generating",
          since: previousRun,
        },
      }),
    );
  });

  it("sets since to null on the department's first ever debrief", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValue(null);
    mockPrisma.debrief.create.mockResolvedValue({ id: "debrief-1" });

    await caller.regenerate();

    expect(mockPrisma.debrief.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ since: null }),
      }),
    );
  });

  it("does not stack runs when one is already generating", async () => {
    // Double-clicking the regenerate button must not queue two agent runs.
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValueOnce({ id: "debrief-9" });

    await expect(caller.regenerate()).resolves.toEqual({
      id: "debrief-9",
      queued: false,
    });
    expect(mockPrisma.debrief.create).not.toHaveBeenCalled();
  });

  it("ignores a Generating row that is too old to still be running", async () => {
    // A crashed run leaves its row Generating forever. Without the age bound
    // the guard above matches it and the department never gets another debrief.
    //
    // Frozen clock so the bound can be asserted exactly. Without it the test can
    // only check "some time in the past", which passes for any offset at all —
    // including one so long the guard never expires.
    //
    // Bound on updatedAt, not createdAt: the Inngest function touches the row
    // as it works, so this means "no progress in 15 minutes".
    vi.useFakeTimers();
    try {
      const now = new Date("2026-08-17T12:00:00.000Z");
      vi.setSystemTime(now);
      mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
      mockPrisma.debrief.findFirst.mockResolvedValue(null);
      mockPrisma.debrief.create.mockResolvedValue({ id: "debrief-3" });

      await caller.regenerate();

      const [inFlightQuery] = mockPrisma.debrief.findFirst.mock.calls[0];
      expect(inFlightQuery.where.status).toBe("Generating");
      expect(inFlightQuery.where.updatedAt.gt).toEqual(
        new Date(now.getTime() - 15 * 60 * 1000),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the {{n}} placeholder contract", () => {
  it("rejects a bullet whose placeholder has no matching link", () => {
    // Renders a literal {{1}} in the card if it gets through.
    expect(
      debriefBulletsSchema.safeParse([
        { text: "Two problems: {{0}} and {{1}}.", links: [BULLET.links[0]] },
      ]).success,
    ).toBe(false);
  });

  it("rejects a link the text never references", () => {
    expect(
      debriefBulletsSchema.safeParse([
        { text: "No placeholder here.", links: [BULLET.links[0]] },
      ]).success,
    ).toBe(false);
  });

  it("accepts a bullet with no links and no placeholders", () => {
    expect(
      debriefBulletsSchema.safeParse([{ text: "Nothing to link.", links: [] }])
        .success,
    ).toBe(true);
  });

  it("accepts a well-formed bullet", () => {
    expect(debriefBulletsSchema.safeParse([BULLET]).success).toBe(true);
  });
});

describe("debrief.regenerate — Inngest dispatch", () => {
  it("dispatches exactly once for a run it opened", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValue(null);
    mockPrisma.debrief.create.mockResolvedValue({ id: "debrief-new" });

    await caller.regenerate();

    expect(mockRequestDebrief).toHaveBeenCalledTimes(1);
    expect(mockRequestDebrief).toHaveBeenCalledWith("debrief-new", "dept-1");
  });

  it("does not dispatch when it joined an active run", async () => {
    // Otherwise a double-click queues a second agent execution against the
    // same row — the exact thing the in-flight guard exists to prevent.
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValueOnce({ id: "debrief-9" });

    await expect(caller.regenerate()).resolves.toEqual({
      id: "debrief-9",
      queued: false,
    });
    expect(mockRequestDebrief).not.toHaveBeenCalled();
  });

  it("does not dispatch for a caller with no department", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: null });

    await expect(caller.regenerate()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(mockRequestDebrief).not.toHaveBeenCalled();
  });
});

describe("debrief.regenerate — when the dispatch fails", () => {
  it("releases the claim instead of leaving a row nothing will write", async () => {
    // requestDebrief reports failure rather than throwing. Unchecked, the row
    // stays Generating: it blocks retries until the staleness bound expires and
    // hides the department's last good debrief, because the newest row wins.
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValue(null);
    mockPrisma.debrief.create.mockResolvedValue({ id: "debrief-1" });
    mockPrisma.debrief.update.mockResolvedValue({ id: "debrief-1" });
    mockRequestDebrief.mockResolvedValue(false);

    await expect(caller.regenerate()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });

    expect(mockPrisma.debrief.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "debrief-1" },
        data: expect.objectContaining({ status: "Failed" }),
      }),
    );
  });

  it("leaves the row alone when the dispatch succeeds", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValue(null);
    mockPrisma.debrief.create.mockResolvedValue({ id: "debrief-1" });
    mockRequestDebrief.mockResolvedValue(true);

    await expect(caller.regenerate()).resolves.toEqual({
      id: "debrief-1",
      queued: true,
    });
    expect(mockPrisma.debrief.update).not.toHaveBeenCalled();
  });
});
