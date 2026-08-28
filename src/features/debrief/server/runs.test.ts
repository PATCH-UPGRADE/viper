// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    debrief: { findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import {
  claimDebriefRun,
  IN_FLIGHT_TIMEOUT_MS,
  isDebriefAbandoned,
  parseBullets,
  pruneSupersededDebriefs,
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
  // Frozen clock so the cutoff itself can be asserted. Against a live clock the
  // boundary case cannot be expressed at all.
  const now = new Date("2026-08-25T12:00:00.000Z");
  const cutoff = new Date(now.getTime() - IN_FLIGHT_TIMEOUT_MS);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls a Generating run that stopped reporting abandoned", () => {
    const stale = new Date(cutoff.getTime() - 1000);

    expect(isDebriefAbandoned({ status: "Generating", updatedAt: stale })).toBe(
      true,
    );
  });

  it("leaves a Generating run that is still reporting alone", () => {
    const fresh = new Date(cutoff.getTime() + 1000);

    expect(isDebriefAbandoned({ status: "Generating", updatedAt: fresh })).toBe(
      false,
    );
  });

  it("counts a run sitting exactly on the cutoff as abandoned", () => {
    // claimDebriefRun holds a run active only while updatedAt is strictly
    // greater than the cutoff, so this run is one the claim path would replace.
    // Reading it as still pending would leave the card polling a run that the
    // next Regenerate press is free to take over.
    expect(
      isDebriefAbandoned({ status: "Generating", updatedAt: cutoff }),
    ).toBe(true);
  });

  it("never calls a finished run abandoned, however old", () => {
    // Only a Generating run can stall. Without the status check every brief
    // older than the timeout reads as a failure, so the card would report
    // "last refresh failed" over yesterday's perfectly good debrief.
    const stale = new Date(cutoff.getTime() - 1000);

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

describe("pruneSupersededDebriefs", () => {
  const kept = new Date("2026-08-25T05:00:00.000Z");

  it("deletes only what is older than the run just written", async () => {
    // Three rules in one exact match. The bound is strict, so the run survives
    // its own prune. A Regenerate press landing between the write and this
    // delete opens a newer row, which the bound also spares. And the delete
    // carries a departmentId, so it cannot reach another department's history.
    mockPrisma.debrief.deleteMany.mockResolvedValue({ count: 4 });

    await expect(pruneSupersededDebriefs("dept-1", kept)).resolves.toBe(4);

    expect(mockPrisma.debrief.deleteMany).toHaveBeenCalledWith({
      where: { departmentId: "dept-1", createdAt: { lt: kept } },
    });
  });
});
