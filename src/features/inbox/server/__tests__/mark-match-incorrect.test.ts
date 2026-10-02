// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession, mockRequestNoteAction } = vi.hoisted(() => {
  const prisma = {
    notificationDeviceGroupMapping: { update: vi.fn() },
    notificationVulnerabilityMapping: { update: vi.fn() },
    matchFeedback: { create: vi.fn() },
    // biome-ignore lint/suspicious/noExplicitAny: callback shape varies
    $transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) =>
      cb(prisma),
    ),
  };
  return {
    mockPrisma: prisma,
    mockGetSession: vi.fn(),
    mockRequestNoteAction: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/lib/auth-utils", () => ({
  getSession: mockGetSession,
  verifyApiKey: vi.fn(),
}));
vi.mock("@/inngest/functions/notes-action", () => ({
  requestNoteAction: mockRequestNoteAction,
}));

import { createCallerFactory } from "@/trpc/init";
import { notificationsRouter } from "../routers";

const USER_ID = "user-test";

const setup = () => {
  mockGetSession.mockResolvedValue({
    user: { id: USER_ID, name: "Test User", email: "test@example.com" },
    session: { id: "session-1", userId: USER_ID },
  });
  // biome-ignore lint/suspicious/noExplicitAny: test stub for tRPC ctx
  return createCallerFactory(notificationsRouter)({ req: {} as any });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.matchFeedback.create.mockResolvedValue({ id: "fb-1" });
});

describe("markMatchIncorrect", () => {
  it("rejects a vulnerability link and records the feedback", async () => {
    await setup().markMatchIncorrect({
      targetType: "NotificationVulnerabilityMapping",
      targetId: "nvm-1",
      notificationId: "n-1",
      comment: "Wrong product line",
    });

    expect(
      mockPrisma.notificationVulnerabilityMapping.update,
    ).toHaveBeenCalledWith({
      where: { id: "nvm-1" },
      data: { confidence: "Rejected" },
    });
    expect(
      mockPrisma.notificationDeviceGroupMapping.update,
    ).not.toHaveBeenCalled();
    expect(mockPrisma.matchFeedback.create).toHaveBeenCalledWith({
      data: {
        targetType: "NotificationVulnerabilityMapping",
        targetId: "nvm-1",
        comment: "Wrong product line",
        userId: USER_ID,
        notificationId: "n-1",
      },
    });
    expect(mockRequestNoteAction).toHaveBeenCalledWith(
      "MATCH_FEEDBACK",
      "fb-1",
    );
  });

  it("rejects a device group link", async () => {
    await setup().markMatchIncorrect({
      targetType: "NotificationDeviceGroupMapping",
      targetId: "ndg-1",
      notificationId: "n-1",
    });

    expect(
      mockPrisma.notificationDeviceGroupMapping.update,
    ).toHaveBeenCalledWith({
      where: { id: "ndg-1" },
      data: { confidence: "Rejected" },
    });
    expect(
      mockPrisma.notificationVulnerabilityMapping.update,
    ).not.toHaveBeenCalled();
    expect(mockRequestNoteAction).not.toHaveBeenCalled();
  });
});
