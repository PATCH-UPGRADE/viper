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

import { MetricType, Prisma } from "@/generated/prisma";
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
  // EPSS and KEV live in metrics, so they sort in memory, not in an orderBy.
  it("builds clauses for columns only, leaving EPSS and KEV out", () => {
    expect(vulnerabilitySortClauses("severity,-epss")).toEqual([
      { severity: { sort: "asc", nulls: "last" } },
    ]);
    expect(vulnerabilitySortClauses("-inKEV,priority")).toEqual([
      { priority: "asc" },
    ]);
  });

  // Postgres puts nulls first on a descending sort; an unrated row is never the answer.
  it("sorts unrated severity and a missing description last both ways", () => {
    expect(vulnerabilitySortClauses("-severity,description")).toEqual([
      { severity: { sort: "desc", nulls: "last" } },
      { description: { sort: "asc", nulls: "last" } },
    ]);
  });

  it("drops a field it does not allow", () => {
    expect(vulnerabilitySortClauses("cvssScore,cveId,displayId")).toEqual([]);
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
      { severity: { sort: "asc", nulls: "last" } },
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
      { severity: { sort: "desc", nulls: "last" } },
      { updatedAt: "desc" },
      { id: "asc" },
    ]);
  });
});

describe("vulnerabilities.getMany sorted by EPSS or KEV", () => {
  const at = new Date("2026-01-01");
  const metric = (type: MetricType, value: number | boolean) => ({
    id: `${type}-${value}`,
    recordId: "record",
    type,
    vector: null,
    score:
      type === MetricType.EPSS ? new Prisma.Decimal(value as number) : null,
    percentile: null,
    severity: null,
    flag: type === MetricType.KEV ? (value as boolean) : null,
    createdAt: at,
    updatedAt: at,
  });
  const row = (id: string, epss: number | null, inKev: boolean | null) => ({
    id,
    createdAt: at,
    updatedAt: at,
    priority: "Unsorted",
    severity: "High",
    description: null,
    records: [
      {
        metrics: [
          ...(epss === null ? [] : [metric(MetricType.EPSS, epss)]),
          ...(inKev === null ? [] : [metric(MetricType.KEV, inKev)]),
        ],
      },
    ],
  });
  const rows = [
    row("a", 0.2, false),
    row("b", null, null), // never scored, never checked against KEV
    row("c", 0.9, true),
    row("d", 0.5, false),
  ];

  /** The ids of the page, in the order the router asked for them. */
  const pageIds = async (input: {
    sort: string;
    page?: number;
    pageSize?: number;
  }) => {
    mockPrisma.vulnerability.findMany
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([]);
    const result = await setup().getMany(input);
    const [args] = mockPrisma.vulnerability.findMany.mock.calls.at(-1) ?? [];
    return { ids: args.where.id.in, totalCount: result.totalCount };
  };

  beforeEach(() => vi.clearAllMocks());

  it("sorts by the newest EPSS score, with unscored rows last both ways", async () => {
    expect((await pageIds({ sort: "-epss" })).ids).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
    expect((await pageIds({ sort: "epss" })).ids).toEqual(["a", "d", "c", "b"]);
  });

  it("puts KEV-listed vulnerabilities first with -inKEV", async () => {
    expect((await pageIds({ sort: "-inKEV,-epss" })).ids).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
  });

  it("pages through the sorted rows", async () => {
    const page = await pageIds({ sort: "-epss", page: 2, pageSize: 2 });
    expect(page.ids).toEqual(["a", "b"]);
    expect(page.totalCount).toBe(4);
  });

  it("does not use an orderBy for the sort", async () => {
    await pageIds({ sort: "-epss" });
    const [args] = mockPrisma.vulnerability.findMany.mock.calls[0];
    expect(args.orderBy).toBeUndefined();
    expect(mockPrisma.vulnerability.count).not.toHaveBeenCalled();
  });
});
