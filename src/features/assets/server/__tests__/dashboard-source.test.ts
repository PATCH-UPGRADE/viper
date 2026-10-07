// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession } = vi.hoisted(() => ({
  mockPrisma: {
    asset: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

vi.mock("@/lib/auth-utils", () => ({
  getSession: mockGetSession,
  verifyApiKey: vi.fn(),
}));

vi.mock("@/features/issues/server/effective-issues", () => ({
  resolveEffectiveIssuesByAsset: vi.fn(async () => new Map()),
}));

import { createCallerFactory } from "@/trpc/init";
import { assetsRouter } from "../routers";

const createCaller = createCallerFactory(assetsRouter);

const setup = () => {
  mockGetSession.mockResolvedValue({
    user: { id: "user-test", email: "test@example.com" },
    session: { id: "session-1", userId: "user-test" },
  });
  return createCaller({ req: undefined });
};

const PAGE_INPUT = { page: 1, pageSize: 10, search: "" };

const IMPORTED_FROM_CSV = {
  externalMappings: { some: { integrationId: "integration-csv" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.asset.count.mockResolvedValue(0);
  mockPrisma.asset.findMany.mockResolvedValue([]);
});

describe("assets.getManyDashboardInternal source filter", () => {
  it.each([
    { title: "lists only devices the given integration imported", sort: "" },
    {
      title: "keeps the source filter when sorting by severity",
      sort: "-severity_Critical",
    },
  ])("$title", async ({ sort }) => {
    await setup().getManyDashboardInternal({
      ...PAGE_INPUT,
      sort,
      source: "integration-csv",
    });

    expect(mockPrisma.asset.count).toHaveBeenCalledWith({
      where: IMPORTED_FROM_CSV,
    });
    expect(mockPrisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: IMPORTED_FROM_CSV }),
    );
  });

  it("does not filter by source when none is given", async () => {
    await setup().getManyDashboardInternal(PAGE_INPUT);

    expect(mockPrisma.asset.count).toHaveBeenCalledWith({ where: {} });
  });
});
