// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockRequirePlatform, mockInngestSend } = vi.hoisted(() => ({
  mockPrisma: {
    workOrderTicket: {
      updateMany: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    integration: { findUniqueOrThrow: vi.fn() },
    user: { findUniqueOrThrow: vi.fn() },
    externalAssetMapping: { findMany: vi.fn() },
    externalWorkOrderMapping: { findMany: vi.fn() },
  },
  mockRequirePlatform: vi.fn(),
  mockInngestSend: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/inngest/client", () => ({
  inngest: { send: mockInngestSend },
}));
vi.mock("@/features/integrations/core/registry", () => ({
  requirePlatform: mockRequirePlatform,
}));
vi.mock("@/features/integrations/core/credentials", () => ({
  decryptCredentials: () => ({ username: "u", password: "p" }),
}));

import {
  claimForSubmission,
  dispatchSubmission,
  fileClaimedTicket,
  finishSubmission,
} from "../submit";

beforeEach(() => vi.clearAllMocks());

describe("dispatchSubmission", () => {
  it("claims the ticket and queues the job", async () => {
    mockPrisma.workOrderTicket.updateMany.mockResolvedValue({ count: 1 });
    mockInngestSend.mockResolvedValue(undefined);

    await expect(dispatchSubmission("t1", "user-1")).resolves.toEqual({
      submissionState: "SUBMITTING",
    });
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: "workOrder/submit.requested",
      data: { ticketId: "t1", actorId: "user-1" },
    });
  });

  // Two approvals race; the loser must not send a second order.
  it("sends nothing when the claim is lost", async () => {
    mockPrisma.workOrderTicket.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.workOrderTicket.findUniqueOrThrow.mockResolvedValue({
      submissionState: "SUBMITTING",
    });

    await expect(dispatchSubmission("t1", "user-1")).resolves.toEqual({
      submissionState: "SUBMITTING",
    });
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  // The claim is held from the moment it is taken. If nothing queues the job
  // and nothing releases it, the ticket sits in SUBMITTING, which
  // claimForSubmission will not take again — no filing, and no retry.
  it("hands the claim back when the job cannot be queued", async () => {
    mockPrisma.workOrderTicket.updateMany.mockResolvedValue({ count: 1 });
    mockInngestSend.mockRejectedValue(new Error("event bus unavailable"));

    const result = await dispatchSubmission("t1", "user-1");

    expect(result).toEqual({
      submissionState: "FAILED",
      error: "event bus unavailable",
    });
    const [args] = mockPrisma.workOrderTicket.update.mock.calls[0];
    expect(args.data.submissionState).toBe("FAILED");
    expect(args.data.submissionError).toBe("event bus unavailable");
  });
});

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

describe("fileClaimedTicket", () => {
  const request = vi.fn();
  const create = vi.fn();

  /** A ticket whose one child already carries a mapping for this integration. */
  const fullyFiled = () => {
    mockPrisma.workOrderTicket.findUniqueOrThrow.mockResolvedValue({
      id: "wo-1",
      summary: "Patch",
      body: null,
      category: "PATCH",
      scheduledAt: null,
      platformPayload: {},
      targetIntegrationId: "int-1",
      assets: [
        {
          asset: { id: "a1", hostname: "MR-1", ip: null },
          ticketId: "child-1",
        },
      ],
    });
    mockPrisma.integration.findUniqueOrThrow.mockResolvedValue({
      platform: "FLEET",
      config: {},
      credentials: new Uint8Array([1]),
      name: "Fleet",
    });
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      name: "Ann Lee",
      email: "ann@example.com",
    });
    mockPrisma.externalAssetMapping.findMany.mockResolvedValue([]);
    mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([
      { itemId: "child-1", externalId: "FLEET-9" },
    ]);
    mockRequirePlatform.mockReturnValue({
      definition: {
        configSchema: { parse: (c: unknown) => c },
        credentialSchema: { parse: (c: unknown) => c },
      },
      createSession: () => ({ request }),
      workOrders: {
        create,
        payloadSchema: { parse: (p: unknown) => p },
        toDraft: (input: unknown) => input,
      },
    });
  };

  it("does not sign in when every asset was already filed", async () => {
    // A Fleet request signs in with a headless browser. A retry of a fully
    // filed order must cost nothing.
    fullyFiled();

    const result = await fileClaimedTicket("wo-1", "user-1");

    expect(create).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(result).toEqual({ externalIds: ["FLEET-9"], failures: [] });
  });
});
