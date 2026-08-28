// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    debrief: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import {
  claimDebriefRun,
  DEBRIEF_RETAINED_PER_DEPARTMENT,
  IN_FLIGHT_TIMEOUT_MS,
  isDebriefAbandoned,
  parseBullets,
  purgeOldDebriefs,
} from "./runs";

const BULLET = {
  text: "Two machines are exposed by {{0}}.",
  links: [
    {
      label: "the Nephrotek flaw",
      entityType: "vulnerability",
      entityId: "vuln-1",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma),
  );
});

describe("claimDebriefRun", () => {
  it("opens a run carrying the previous Ready run's timestamp", async () => {
    const previousRun = new Date("2026-08-24T18:20:00.000Z");
    mockPrisma.debrief.findFirst
      .mockResolvedValueOnce(null) // nothing in flight
      .mockResolvedValueOnce({ createdAt: previousRun });
    mockPrisma.debrief.create.mockResolvedValue({ id: "run-1" });

    await expect(claimDebriefRun("dept-1")).resolves.toEqual({
      id: "run-1",
      created: true,
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

  it("sets since to null on a department's first ever run", async () => {
    // The Inngest writer must read this as "no previous debrief", not as a
    // missing value it should fill in.
    mockPrisma.debrief.findFirst.mockResolvedValue(null);
    mockPrisma.debrief.create.mockResolvedValue({ id: "run-1" });

    await claimDebriefRun("dept-1");

    expect(mockPrisma.debrief.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ since: null }),
      }),
    );
  });

  it("joins an active run rather than opening a second", async () => {
    mockPrisma.debrief.findFirst.mockResolvedValueOnce({ id: "run-9" });

    await expect(claimDebriefRun("dept-1")).resolves.toEqual({
      id: "run-9",
      created: false,
    });
    expect(mockPrisma.debrief.create).not.toHaveBeenCalled();
  });
});

describe("claimDebriefRun — concurrency", () => {
  it("takes a per-department advisory lock before deciding", async () => {
    // The check and the create are separate statements. Without the lock two
    // callers arriving together both see "nothing in flight" and both open a
    // row.
    mockPrisma.debrief.findFirst.mockResolvedValue(null);
    mockPrisma.debrief.create.mockResolvedValue({ id: "run-1" });

    await claimDebriefRun("dept-1");

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    // Keyed on the department, so departments do not block each other.
    const [, ...values] = mockPrisma.$executeRaw.mock.calls[0];
    expect(values).toContain("dept-1");
  });

  it("does every read and the create inside the transaction", async () => {
    // A read outside it would not be covered by the lock.
    mockPrisma.debrief.findFirst.mockResolvedValue(null);
    mockPrisma.debrief.create.mockResolvedValue({ id: "run-1" });

    let readsInside = 0;
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => unknown) => {
        const before = mockPrisma.debrief.findFirst.mock.calls.length;
        const result = await fn(mockPrisma);
        readsInside = mockPrisma.debrief.findFirst.mock.calls.length - before;
        return result;
      },
    );

    await claimDebriefRun("dept-1");

    expect(readsInside).toBe(2);
    expect(mockPrisma.debrief.create).toHaveBeenCalledTimes(1);
  });
});

describe("claimDebriefRun — staleness", () => {
  it("measures progress, not age", async () => {
    // Bound on updatedAt: the Inngest function touches the row as it works, so
    // a long but healthy run keeps its claim while a crashed one goes stale.
    vi.useFakeTimers();
    try {
      const now = new Date("2026-08-25T12:00:00.000Z");
      vi.setSystemTime(now);
      mockPrisma.debrief.findFirst.mockResolvedValue(null);
      mockPrisma.debrief.create.mockResolvedValue({ id: "run-1" });

      await claimDebriefRun("dept-1");

      const [query] = mockPrisma.debrief.findFirst.mock.calls[0];
      expect(query.where.status).toBe("Generating");
      expect(query.where.updatedAt.gt).toEqual(
        new Date(now.getTime() - IN_FLIGHT_TIMEOUT_MS),
      );
      expect(query.where).not.toHaveProperty("createdAt");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("isDebriefAbandoned", () => {
  const stale = new Date(Date.now() - IN_FLIGHT_TIMEOUT_MS - 1000);
  const fresh = new Date(Date.now() - 1000);

  it("calls a Generating run that stopped reporting abandoned", () => {
    expect(isDebriefAbandoned({ status: "Generating", updatedAt: stale })).toBe(
      true,
    );
  });

  it("leaves a Generating run that is still reporting alone", () => {
    expect(isDebriefAbandoned({ status: "Generating", updatedAt: fresh })).toBe(
      false,
    );
  });

  it("never calls a finished run abandoned, however old", () => {
    // Only a Generating run can stall. Without the status check every brief
    // older than the timeout reads as a failure, so the card would report
    // "last refresh failed" over yesterday's perfectly good debrief.
    expect(isDebriefAbandoned({ status: "Ready", updatedAt: stale })).toBe(
      false,
    );
    expect(isDebriefAbandoned({ status: "Failed", updatedAt: stale })).toBe(
      false,
    );
  });
});

describe("parseBullets", () => {
  it("returns stored bullets that satisfy the contract", () => {
    expect(parseBullets([BULLET])).toEqual([BULLET]);
  });

  it("returns nothing for a row that fails the contract", () => {
    // One bad row must not break the overview page or a later run's context.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseBullets([{ text: "", links: "not-an-array" }])).toEqual([]);
    expect(parseBullets(null)).toEqual([]);
  });

  it("returns nothing for an empty array, which the schema rejects", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseBullets([])).toEqual([]);
  });
});

describe("purgeOldDebriefs", () => {
  it("does nothing when no department is over the limit", async () => {
    mockPrisma.debrief.groupBy.mockResolvedValue([]);

    await expect(purgeOldDebriefs()).resolves.toBe(0);
    expect(mockPrisma.debrief.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps the newest runs and deletes the rest, per department", async () => {
    // Per department rather than one global cutoff, so a quiet department
    // keeps its history instead of losing it to busier neighbours.
    const oldest = new Date("2026-08-01T00:00:00.000Z");
    mockPrisma.debrief.groupBy.mockResolvedValue([{ departmentId: "dept-1" }]);
    mockPrisma.debrief.findMany.mockResolvedValue([
      { id: "keep-1", createdAt: new Date("2026-08-02T00:00:00.000Z") },
      { id: "keep-2", createdAt: oldest },
    ]);
    mockPrisma.debrief.findFirst.mockResolvedValue({ id: "keep-1" });
    mockPrisma.debrief.deleteMany.mockResolvedValue({ count: 7 });

    await expect(purgeOldDebriefs()).resolves.toBe(7);

    const [kept] = mockPrisma.debrief.findMany.mock.calls[0];
    expect(kept.take).toBe(DEBRIEF_RETAINED_PER_DEPARTMENT);
    expect(kept.orderBy).toEqual({ createdAt: "desc" });

    expect(mockPrisma.debrief.deleteMany).toHaveBeenCalledWith({
      where: {
        departmentId: "dept-1",
        // A run opened after the read above is newer than every retained row,
        // so this bound keeps the purge off it.
        createdAt: { lt: oldest },
        id: { not: "keep-1" },
      },
    });
  });

  it("keeps the newest Ready run even when it falls outside the window", async () => {
    // A department whose runs keep failing pushes its last good brief past the
    // retained window. Deleting it takes away the brief the reader sees and
    // the context the next run reads back.
    mockPrisma.debrief.groupBy.mockResolvedValue([{ departmentId: "dept-1" }]);
    mockPrisma.debrief.findMany.mockResolvedValue([
      { id: "failed-1", createdAt: new Date("2026-08-02T00:00:00.000Z") },
    ]);
    mockPrisma.debrief.findFirst.mockResolvedValue({ id: "ready-old" });
    mockPrisma.debrief.deleteMany.mockResolvedValue({ count: 3 });

    await purgeOldDebriefs();

    const [args] = mockPrisma.debrief.deleteMany.mock.calls[0];
    expect(args.where.id).toEqual({ not: "ready-old" });
  });

  it("scopes every delete to one department", async () => {
    // A delete without the departmentId would take other departments' rows.
    mockPrisma.debrief.groupBy.mockResolvedValue([
      { departmentId: "dept-1" },
      { departmentId: "dept-2" },
    ]);
    mockPrisma.debrief.findMany.mockResolvedValue([
      { id: "keep", createdAt: new Date("2026-08-01T00:00:00.000Z") },
    ]);
    mockPrisma.debrief.findFirst.mockResolvedValue(null);
    mockPrisma.debrief.deleteMany.mockResolvedValue({ count: 1 });

    await expect(purgeOldDebriefs()).resolves.toBe(2);

    for (const [args] of mockPrisma.debrief.deleteMany.mock.calls) {
      expect(args.where.departmentId).toBeDefined();
    }
  });
});
