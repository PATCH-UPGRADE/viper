// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession } = vi.hoisted(() => ({
  mockPrisma: {
    asset: { count: vi.fn(), findMany: vi.fn() },
    deviceGroupMatching: { findMany: vi.fn() },
    issue: { findMany: vi.fn() },
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

import { IssueStatus } from "@/generated/prisma";
import { createCallerFactory } from "@/trpc/init";
import { assetsRouter } from "../routers";

const createCaller = createCallerFactory(assetsRouter);

const FAKE_USER_ID = "user-test";

const setup = () => {
  mockGetSession.mockResolvedValue({
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
  // biome-ignore lint/suspicious/noExplicitAny: test stub for tRPC ctx
  return createCaller({ req: {} as any });
};

const makeAssetRow = (id: string, manufacturerId: string | null) => ({
  id,
  manufacturerId,
  productId: manufacturerId ? "prod-sigma" : null,
  versionId: null,
  ip: null,
  role: null,
  networkSegment: null,
  hostname: id,
  macAddress: null,
  serialNumber: null,
  location: null,
  status: null,
  utilization: null,
  userId: FAKE_USER_ID,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
  user: {
    id: FAKE_USER_ID,
    name: "Test User",
    email: "test@example.com",
    image: null,
  },
  manufacturer: null,
  product: null,
  version: null,
  versionStatus: "KNOWN",
  vulnerabilitiesUrl: `http://localhost:3000/api/v1/assets/${id}/vulnerabilities`,
  externalMappings: [],
  managedBy: [],
});

const PUMP_MATCHING = {
  id: "matching-pumps",
  manufacturerId: "mf-baxter",
  productId: "prod-sigma",
  versionId: null,
  versionRange: null,
};

const issue = (
  id: string,
  vulnerabilityId: string,
  severity: string,
  target: { assetId: string } | { deviceGroupMatchingId: string },
  status: IssueStatus = IssueStatus.AFFECTED,
) => ({
  id,
  vulnerabilityId,
  assetId: null,
  deviceGroupMatchingId: null,
  ...target,
  status,
  createdAt: new Date("2026-01-01"),
  vulnerability: { severity },
});

// p1 and p2 are pumps, so the two fleet issues reach both. p1 overrides the
// Critical one as NOT_AFFECTED. The monitor has no manufacturer, so no matching
// applies to it, and it has one direct Low issue.
const ASSETS = [
  makeAssetRow("monitor", null),
  makeAssetRow("p1", "mf-baxter"),
  makeAssetRow("p2", "mf-baxter"),
];
const ISSUES = [
  issue("fleet-critical", "vuln-1", "Critical", {
    deviceGroupMatchingId: "matching-pumps",
  }),
  issue("fleet-high", "vuln-2", "High", {
    deviceGroupMatchingId: "matching-pumps",
  }),
  issue(
    "p1-override",
    "vuln-1",
    "Critical",
    { assetId: "p1" },
    IssueStatus.NOT_AFFECTED,
  ),
  issue("monitor-low", "vuln-3", "Low", { assetId: "monitor" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.asset.count.mockResolvedValue(ASSETS.length);
  mockPrisma.asset.findMany.mockResolvedValue(ASSETS);
  mockPrisma.deviceGroupMatching.findMany.mockResolvedValue([PUMP_MATCHING]);
  mockPrisma.issue.findMany.mockResolvedValue(ISSUES);
});

describe("assets.getMany sort by effective issues", () => {
  it("ranks by affected issues, with fleet issues and the asset override", async () => {
    const result = await setup().getMany({ sort: "-affectedIssues" });

    expect(
      result.items.map((asset) => [asset.id, asset.affectedIssueCounts]),
    ).toEqual([
      ["p2", { total: 2, Critical: 1, High: 1, Medium: 0, Low: 0 }],
      ["monitor", { total: 1, Critical: 0, High: 0, Medium: 0, Low: 1 }],
      ["p1", { total: 1, Critical: 0, High: 1, Medium: 0, Low: 0 }],
    ]);
  });

  it("ranks by severity, most critical first", async () => {
    const result = await setup().getMany({
      sort: "-severity_Critical,-severity_High,-severity_Low",
    });

    expect(result.items.map((asset) => asset.id)).toEqual([
      "p2",
      "p1",
      "monitor",
    ]);
  });

  it("loads every asset, then returns the requested page", async () => {
    const result = await setup().getMany({
      sort: "-affectedIssues",
      page: 2,
      pageSize: 1,
    });

    const [args] = mockPrisma.asset.findMany.mock.calls[0];
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
    expect(result.totalCount).toBe(3);
    expect(result.items.map((asset) => asset.id)).toEqual(["monitor"]);
  });
});

// The in-memory paths query Prisma themselves, not through fetchPaginated,
// so they must add the date filter on their own.
describe("in-memory sort date filter", () => {
  const dates = {
    lastUpdatedStartTime: "2026-10-20T00:00:00Z",
    lastUpdatedEndTime: "2026-10-21T00:00:00Z",
  };

  it.each([
    ["getMany", "-affectedIssues"],
    ["getManyDashboardInternal", "-severity_Critical"],
  ] as const)(
    "%s with sort %s filters on updatedAt",
    async (procedure, sort) => {
      await setup()[procedure]({ sort, ...dates });

      const [args] = mockPrisma.asset.findMany.mock.calls[0];
      expect(args.where.updatedAt).toEqual({
        gte: new Date(dates.lastUpdatedStartTime),
        lte: new Date(dates.lastUpdatedEndTime),
      });
    },
  );

  it("adds no date filter when the fields are empty", async () => {
    await setup().getMany({ sort: "-affectedIssues" });

    const [args] = mockPrisma.asset.findMany.mock.calls[0];
    expect(args.where).not.toHaveProperty("updatedAt");
  });
});

describe("assets.getMany plain sort", () => {
  it("sorts in SQL and still reports the affected issue counts", async () => {
    const result = await setup().getMany({ sort: "-hostname" });

    const [args] = mockPrisma.asset.findMany.mock.calls[0];
    expect(args.orderBy).toEqual([
      { hostname: "desc" },
      { updatedAt: "desc" },
      { id: "asc" },
    ]);
    expect(args.take).toBe(10);
    expect(
      result.items.find((a) => a.id === "p2")?.affectedIssueCounts,
    ).toEqual({ total: 2, Critical: 1, High: 1, Medium: 0, Low: 0 });
  });

  it("keeps the newest-created order with no sort", async () => {
    await setup().getMany({});

    const [args] = mockPrisma.asset.findMany.mock.calls[0];
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });

  // "-issues" counts direct issues only, so getMany does not offer it.
  it.each(["bogus", "-issues"])(
    "ignores the unknown sort field %s",
    async (sort) => {
      await setup().getMany({ sort });

      const [args] = mockPrisma.asset.findMany.mock.calls[0];
      expect(args.orderBy).toEqual({ createdAt: "desc" });
    },
  );

  it("sorts by the known fields and drops the unknown ones", async () => {
    await setup().getMany({ sort: "bogus,-hostname" });

    const [args] = mockPrisma.asset.findMany.mock.calls[0];
    expect(args.orderBy).toEqual([
      { hostname: "desc" },
      { updatedAt: "desc" },
      { id: "asc" },
    ]);
  });
});
