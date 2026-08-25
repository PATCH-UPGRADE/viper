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
  it("returns null when the user belongs to no department", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: null });

    await expect(caller.getForMyDepartment()).resolves.toBeNull();
    // No department means no reason to touch the debrief table at all.
    expect(mockPrisma.debrief.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when the department has no debrief yet", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValue(null);

    await expect(caller.getForMyDepartment()).resolves.toBeNull();
  });

  it("returns the newest debrief for the department", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValue(readyRow());

    const result = await caller.getForMyDepartment();

    expect(result).toMatchObject({
      id: "debrief-1",
      department: DEPARTMENT,
      status: "Ready",
    });
    expect(result?.bullets).toEqual([BULLET]);

    // Newest-first ordering is what makes this "the current debrief".
    expect(mockPrisma.debrief.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { departmentId: "dept-1" },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  // Both of these keep the row's valid bullets in the fixture on purpose. With
  // an empty array the assertion passes either way, because an empty array also
  // fails debriefBulletsSchema — so it would prove nothing about the status
  // guard. Only a row that *has* bullets shows that the guard withholds them.
  it("withholds bullets from a Generating row", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValue(
      readyRow({ status: "Generating" }),
    );

    const result = await caller.getForMyDepartment();

    expect(result?.status).toBe("Generating");
    expect(result?.bullets).toEqual([]);
  });

  it("returns no bullets for a Failed row, without leaking the error", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValue(
      readyRow({ status: "Failed" }),
    );

    const result = await caller.getForMyDepartment();

    expect(result?.status).toBe("Failed");
    expect(result?.bullets).toEqual([]);
    expect(result).not.toHaveProperty("error");
  });

  it("survives a stored row that fails the bullet contract", async () => {
    // A row written before a schema change must not break the overview page.
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValue(
      readyRow({ bullets: [{ text: "", links: "not-an-array" }] }),
    );

    const result = await caller.getForMyDepartment();

    expect(result?.bullets).toEqual([]);
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

describe("debrief.regenerate — concurrent callers", () => {
  it("takes a per-department lock before deciding whether a run exists", async () => {
    // The in-flight check and the create are separate statements. Without the
    // lock, two callers clicking at once both see "nothing in flight" and both
    // open a row — the exact case the guard is supposed to prevent.
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValue(null);
    mockPrisma.debrief.create.mockResolvedValue({ id: "debrief-1" });

    await caller.regenerate();

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);

    // The department id is interpolated into the lock key, so departments do
    // not block each other.
    const [, ...values] = mockPrisma.$executeRaw.mock.calls[0];
    expect(values).toContain("dept-1");
  });

  it("does the whole claim inside one transaction", async () => {
    // A read outside the transaction would not be covered by the lock.
    mockPrisma.user.findUnique.mockResolvedValue({ departmentId: "dept-1" });
    mockPrisma.debrief.findFirst.mockResolvedValue(null);
    mockPrisma.debrief.create.mockResolvedValue({ id: "debrief-1" });

    let insideTransaction = 0;
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => unknown) => {
        const before = mockPrisma.debrief.findFirst.mock.calls.length;
        const result = await fn(mockPrisma);
        insideTransaction =
          mockPrisma.debrief.findFirst.mock.calls.length - before;
        return result;
      },
    );

    await caller.regenerate();

    expect(insideTransaction).toBe(2);
    expect(mockPrisma.debrief.create).toHaveBeenCalledTimes(1);
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
