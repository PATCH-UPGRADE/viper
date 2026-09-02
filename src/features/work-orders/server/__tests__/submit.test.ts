// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    workOrderTicket: { updateMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { claimForSubmission, finishSubmission } from "../submit";

beforeEach(() => vi.clearAllMocks());

describe("claimForSubmission", () => {
  it("claims a ticket that is waiting to be filed", async () => {
    mockPrisma.workOrderTicket.updateMany.mockResolvedValue({ count: 1 });

    await expect(claimForSubmission("t1")).resolves.toBe(true);

    // The state is part of the WHERE, not just the data: that is what makes two
    // racing approvals resolve to one filing.
    const [args] = mockPrisma.workOrderTicket.updateMany.mock.calls[0];
    expect(args.where.submissionState.in).toEqual(["PENDING", "FAILED"]);
    expect(args.data.submissionState).toBe("SUBMITTING");
  });

  it("refuses when another request already claimed it", async () => {
    mockPrisma.workOrderTicket.updateMany.mockResolvedValue({ count: 0 });

    await expect(claimForSubmission("t1")).resolves.toBe(false);
  });
});

describe("finishSubmission", () => {
  it("marks a fully filed order submitted", async () => {
    await finishSubmission("t1", 2, []);

    const [args] = mockPrisma.workOrderTicket.update.mock.calls[0];
    expect(args.data.submissionState).toBe("SUBMITTED");
    expect(args.data.submissionError).toBeNull();
    expect(args.data.submittedAt).toBeInstanceOf(Date);
  });

  it("keeps a partial success, and says which asset failed", async () => {
    // An order the platform accepted must stay recorded, or the next attempt
    // files it a second time.
    await finishSubmission("t1", 1, [{ asset: "CT-1", message: "503" }]);

    const [args] = mockPrisma.workOrderTicket.update.mock.calls[0];
    expect(args.data.submissionState).toBe("SUBMITTED");
    expect(args.data.submissionError).toMatch(/CT-1 — 503/);
  });

  it("fails the ticket when nothing was filed", async () => {
    await finishSubmission("t1", 0, [{ asset: "MR-1", message: "401" }]);

    const [args] = mockPrisma.workOrderTicket.update.mock.calls[0];
    expect(args.data.submissionState).toBe("FAILED");
    expect(args.data.submissionError).toMatch(/MR-1 — 401/);
  });
});
