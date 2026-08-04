// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession } = vi.hoisted(() => ({
  mockPrisma: {
    vendor: {
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

import { createCallerFactory } from "@/trpc/init";
import { vendorsRouter } from "./routers";

const createCaller = createCallerFactory(vendorsRouter);

const FAKE_USER_ID = "user-test";

const makeSession = () => ({
  user: {
    id: FAKE_USER_ID,
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: "session-1",
    userId: FAKE_USER_ID,
    token: "token",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

const setup = () => {
  mockGetSession.mockResolvedValue(makeSession());
  // biome-ignore lint/suspicious/noExplicitAny: test stub for tRPC ctx
  return createCaller({ req: {} as any });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("vendorsRouter.getMany", () => {
  it("counts each asset once even when two contracts cover it", async () => {
    mockPrisma.vendor.findMany.mockResolvedValue([
      {
        id: "vendor-1",
        canonicalName: "siemens healthineers",
        canonicalDisplayName: "Siemens Healthineers",
        overview: null,
        partnerSince: null,
        contracts: [
          { covers: [{ assetId: "a1" }, { assetId: "a2" }] },
          { covers: [{ assetId: "a2" }, { assetId: "a3" }] },
        ],
      },
    ]);
    const caller = setup();

    const result = await caller.getMany();

    expect(result).toEqual([
      {
        id: "vendor-1",
        canonicalName: "siemens healthineers",
        canonicalDisplayName: "Siemens Healthineers",
        overview: null,
        partnerSince: null,
        assetCount: 3,
      },
    ]);
  });

  it("reports zero for a vendor with no contracts", async () => {
    mockPrisma.vendor.findMany.mockResolvedValue([
      {
        id: "vendor-2",
        canonicalName: "acme biomed",
        canonicalDisplayName: "Acme Biomed",
        overview: null,
        partnerSince: null,
        contracts: [],
      },
    ]);
    const caller = setup();

    const [vendor] = await caller.getMany();

    expect(vendor.assetCount).toBe(0);
  });

  it("orders vendors by display name", async () => {
    mockPrisma.vendor.findMany.mockResolvedValue([]);
    const caller = setup();

    await caller.getMany();

    expect(mockPrisma.vendor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { canonicalDisplayName: "asc" } }),
    );
  });
});
