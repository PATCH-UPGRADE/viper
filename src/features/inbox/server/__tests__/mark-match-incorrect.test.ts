// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession, mockRequestNoteAction } = vi.hoisted(() => {
  const prisma = {
    sourceRecordDeviceGroupMapping: {
      findFirstOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    sourceRecordVulnerabilityMapping: {
      findFirstOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
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

// The mapping must sit on a record that feeds this notification.
const inNotification = {
  sourceRecord: { links: { some: { notificationId: "n-1" } } },
};

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
  mockPrisma.sourceRecordVulnerabilityMapping.findFirstOrThrow.mockResolvedValue(
    { vulnerabilityId: "vuln-1" },
  );
  mockPrisma.sourceRecordDeviceGroupMapping.findFirstOrThrow.mockResolvedValue({
    deviceGroupMatchingId: "dgm-1",
  });
});

describe("markMatchIncorrect", () => {
  it("rejects a vulnerability on every source of the notification and records the feedback", async () => {
    await setup().markMatchIncorrect({
      targetType: "SourceRecordVulnerabilityMapping",
      targetId: "svm-1",
      notificationId: "n-1",
      comment: "Wrong product line",
    });

    expect(
      mockPrisma.sourceRecordVulnerabilityMapping.findFirstOrThrow,
    ).toHaveBeenCalledWith({
      where: { id: "svm-1", ...inNotification },
      select: { vulnerabilityId: true },
    });
    expect(
      mockPrisma.sourceRecordVulnerabilityMapping.updateMany,
    ).toHaveBeenCalledWith({
      where: { vulnerabilityId: "vuln-1", ...inNotification },
      data: { confidence: "Rejected" },
    });
    expect(
      mockPrisma.sourceRecordDeviceGroupMapping.updateMany,
    ).not.toHaveBeenCalled();
    expect(mockPrisma.matchFeedback.create).toHaveBeenCalledWith({
      data: {
        targetType: "SourceRecordVulnerabilityMapping",
        targetId: "svm-1",
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

  it("rejects a device group on every source of the notification", async () => {
    await setup().markMatchIncorrect({
      targetType: "SourceRecordDeviceGroupMapping",
      targetId: "sdg-1",
      notificationId: "n-1",
    });

    expect(
      mockPrisma.sourceRecordDeviceGroupMapping.updateMany,
    ).toHaveBeenCalledWith({
      where: { deviceGroupMatchingId: "dgm-1", ...inNotification },
      data: { confidence: "Rejected" },
    });
    expect(
      mockPrisma.sourceRecordVulnerabilityMapping.updateMany,
    ).not.toHaveBeenCalled();
    expect(mockRequestNoteAction).not.toHaveBeenCalled();
  });

  it("refuses a mapping that belongs to another notification", async () => {
    mockPrisma.sourceRecordVulnerabilityMapping.findFirstOrThrow.mockRejectedValue(
      new Error("No SourceRecordVulnerabilityMapping found"),
    );

    await expect(
      setup().markMatchIncorrect({
        targetType: "SourceRecordVulnerabilityMapping",
        targetId: "svm-other",
        notificationId: "n-1",
      }),
    ).rejects.toThrow();

    expect(
      mockPrisma.sourceRecordVulnerabilityMapping.updateMany,
    ).not.toHaveBeenCalled();
    expect(mockPrisma.matchFeedback.create).not.toHaveBeenCalled();
  });
});
