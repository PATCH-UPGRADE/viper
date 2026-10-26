// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession } = vi.hoisted(() => ({
  mockPrisma: {
    asset: { findUnique: vi.fn() },
    vulnerability: { count: vi.fn(), findMany: vi.fn() },
  },
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

vi.mock("@/lib/auth-utils", () => ({
  getSession: mockGetSession,
  verifyApiKey: vi.fn(),
}));

vi.mock("@/features/notes/server/get-relevant-notes", () => ({
  attachNotes: vi.fn(async (_scope: string, rows: unknown[]) => rows),
  attachNote: vi.fn(async (_scope: string, row: unknown) => row),
}));

import { createCallerFactory } from "@/trpc/init";
import { vulnerabilitiesRouter, vulnerabilitySortClauses } from "../routers";

const createCaller = createCallerFactory(vulnerabilitiesRouter);

const setup = () => {
  mockGetSession.mockResolvedValue({
    user: {
      id: "user-test",
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: "session-1",
      userId: "user-test",
      token: "token",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  // biome-ignore lint/suspicious/noExplicitAny: test stub for tRPC ctx
  return createCaller({ req: {} as any });
};

describe("vulnerabilitySortClauses", () => {
  it("sorts by severity, and by EPSS with unscored rows last", () => {
    expect(vulnerabilitySortClauses("severity,-epss")).toEqual([
      { severity: "asc" },
      { epss: { sort: "desc", nulls: "last" } },
    ]);
    expect(vulnerabilitySortClauses("epss")).toEqual([
      { epss: { sort: "asc", nulls: "last" } },
    ]);
  });

  it("drops a field it does not allow", () => {
    expect(vulnerabilitySortClauses("cvssScore,-inKEV")).toEqual([
      { inKEV: "desc" },
    ]);
    expect(vulnerabilitySortClauses("")).toEqual([]);
  });
});

// An asset with no manufacturer matches no rule, so the page query runs on an
// empty id list and needs no matching mocks.
describe("vulnerabilities.getManyByAsset and getMany sort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.asset.findUnique.mockResolvedValue({
      id: "asset-1",
      manufacturerId: null,
      productId: null,
      versionId: null,
      version: null,
    });
    mockPrisma.vulnerability.count.mockResolvedValue(0);
    mockPrisma.vulnerability.findMany.mockResolvedValue([]);
  });

  it("applies the sort", async () => {
    await setup().getManyByAsset({ id: "asset-1", sort: "severity" });

    const [args] = mockPrisma.vulnerability.findMany.mock.calls[0];
    expect(args.orderBy).toEqual([
      { severity: "asc" },
      { updatedAt: "desc" },
      { id: "asc" },
    ]);
  });

  it("keeps the newest-created order with no sort", async () => {
    await setup().getManyByAsset({ id: "asset-1" });

    const [args] = mockPrisma.vulnerability.findMany.mock.calls[0];
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });

  // Rows that tie on every sorted field and on updatedAt need a unique last
  // key, or a row can move between pages.
  it("ends a sorted getMany with the id, so pages do not overlap", async () => {
    await setup().getMany({ sort: "-severity" });

    const [args] = mockPrisma.vulnerability.findMany.mock.calls[0];
    expect(args.orderBy).toEqual([
      { severity: "desc" },
      { updatedAt: "desc" },
      { id: "asc" },
    ]);
  });
});
