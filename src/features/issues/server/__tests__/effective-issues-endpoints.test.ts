// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession } = vi.hoisted(() => {
  const prisma = {
    asset: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    deviceGroup: {
      findMany: vi.fn(),
    },
    deviceGroupMatching: {
      findMany: vi.fn(),
    },
    issue: {
      findMany: vi.fn(),
    },
  };
  return {
    mockPrisma: prisma,
    mockGetSession: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

vi.mock("@/lib/auth-utils", () => ({
  getSession: mockGetSession,
  verifyApiKey: vi.fn(),
}));

import { assetsRouter } from "@/features/assets/server/routers";
import { IssueStatus } from "@/generated/prisma";
import { createCallerFactory } from "@/trpc/init";
import { issuesRouter } from "../routers";

const createAssetsCaller = createCallerFactory(assetsRouter);
const createIssuesCaller = createCallerFactory(issuesRouter);

const makeSession = () => ({
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

const setup = () => {
  mockGetSession.mockResolvedValue(makeSession());
  return {
    // biome-ignore lint/suspicious/noExplicitAny: test stub for tRPC ctx
    assets: createAssetsCaller({ req: {} as any }),
    // biome-ignore lint/suspicious/noExplicitAny: test stub for tRPC ctx
    issues: createIssuesCaller({ req: {} as any }),
  };
};

const PUMP_MATCHING = {
  id: "matching-pumps",
  manufacturerId: "mf-baxter",
  productId: "prod-sigma",
  versionId: null,
  versionRange: null,
};

const RANGE_MATCHING = {
  id: "matching-versioned",
  manufacturerId: "mf-baxter",
  productId: "prod-sigma",
  versionId: null,
  versionRange: "vers:semver/>=1.0|<2.0",
};

const PUMP_GROUP = {
  id: "dg-pumps",
  manufacturerId: "mf-baxter",
  productId: "prod-sigma",
  versionId: null,
  version: null,
};

const vulnerability = {
  id: "vuln-1",
  severity: "Critical",
  cveId: "CVE-2026-FOO",
  description: "Credential exposure",
  _count: { remediations: 1 },
  remediations: [],
};

const FLEET_ISSUE = {
  id: "issue-fleet",
  vulnerabilityId: "vuln-1",
  assetId: null,
  deviceGroupMatchingId: "matching-pumps",
  status: IssueStatus.AFFECTED,
  createdAt: new Date("2026-01-01"),
  vulnerability,
};

const OVERRIDE_ISSUE = {
  id: "issue-override",
  vulnerabilityId: "vuln-1",
  assetId: "bar",
  deviceGroupMatchingId: null,
  status: IssueStatus.NOT_AFFECTED,
  createdAt: new Date("2026-02-01"),
  vulnerability,
};

const makeAsset = (id: string) => ({
  id,
  deviceGroupId: "dg-pumps",
  updatedAt: new Date("2026-01-15"),
});

const PUMPS = [makeAsset("bar"), makeAsset("p2"), makeAsset("p3")];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.asset.count.mockResolvedValue(PUMPS.length);
  mockPrisma.asset.findMany.mockResolvedValue(PUMPS);
  mockPrisma.deviceGroup.findMany.mockResolvedValue([PUMP_GROUP]);
  mockPrisma.deviceGroupMatching.findMany.mockResolvedValue([PUMP_MATCHING]);
  mockPrisma.issue.findMany.mockResolvedValue([FLEET_ISSUE, OVERRIDE_ISSUE]);
});

describe("assets.getManyDashboardInternal — effective issues per row", () => {
  it("shows the fleet issue on every pump and lets bar's override win", async () => {
    const { assets } = setup();

    const result = await assets.getManyDashboardInternal({
      page: 1,
      pageSize: 25,
      search: "",
    });

    const issuesByAsset = Object.fromEntries(
      result.items.map((asset) => [
        asset.id,
        asset.issues.map((issue: { id: string; status: IssueStatus }) => [
          issue.id,
          issue.status,
        ]),
      ]),
    );
    expect(issuesByAsset).toEqual({
      bar: [["issue-override", IssueStatus.NOT_AFFECTED]],
      p2: [["issue-fleet", IssueStatus.AFFECTED]],
      p3: [["issue-fleet", IssueStatus.AFFECTED]],
    });
  });

  it("does not apply a version-constrained matching to an unknown-version group", async () => {
    mockPrisma.deviceGroupMatching.findMany.mockResolvedValue([RANGE_MATCHING]);
    mockPrisma.issue.findMany.mockResolvedValue([
      { ...FLEET_ISSUE, deviceGroupMatchingId: "matching-versioned" },
    ]);
    const { assets } = setup();

    const result = await assets.getManyDashboardInternal({
      page: 1,
      pageSize: 25,
      search: "",
    });

    for (const asset of result.items) {
      expect(asset.issues).toEqual([]);
    }
  });
});

describe("assets.getIssueMetricsInternal — affected-asset counts", () => {
  it("counts assets, not issue rows, and honors the override", async () => {
    const { assets } = setup();

    const metrics = await assets.getIssueMetricsInternal();

    expect(metrics.Critical).toEqual({
      active: 2,
      activeWithRemediations: 2,
      remediated: 0,
    });
    expect(metrics.High).toEqual({
      active: 0,
      activeWithRemediations: 0,
      remediated: 0,
    });
  });

  it("does not double-count a machine affected at two severities in the totals", async () => {
    const highVulnerability = {
      ...vulnerability,
      id: "vuln-2",
      severity: "High",
    };
    mockPrisma.issue.findMany.mockResolvedValue([
      FLEET_ISSUE,
      {
        ...FLEET_ISSUE,
        id: "issue-fleet-high",
        vulnerabilityId: "vuln-2",
        vulnerability: highVulnerability,
      },
    ]);
    const { assets } = setup();

    const metrics = await assets.getIssueMetricsInternal();

    expect(metrics.Critical.active).toBe(3);
    expect(metrics.High.active).toBe(3);
    expect(metrics.totals.active).toBe(3);
  });
});

describe("issues.getManyInternalByStatusAndAssetId — per-asset tabs", () => {
  it("lists bar's override under NOT_AFFECTED and hides the fleet issue from its AFFECTED tab", async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(makeAsset("bar"));
    const { issues } = setup();

    const notAffected = await issues.getManyInternalByStatusAndAssetId({
      assetId: "bar",
      issueStatus: IssueStatus.NOT_AFFECTED,
      page: 1,
      pageSize: 10,
      search: "",
    });
    const affected = await issues.getManyInternalByStatusAndAssetId({
      assetId: "bar",
      issueStatus: IssueStatus.AFFECTED,
      page: 1,
      pageSize: 10,
      search: "",
    });

    expect(notAffected.items.map((issue) => issue.id)).toEqual([
      "issue-override",
    ]);
    expect(affected.items).toEqual([]);
  });

  it("keeps the fleet issue on a sibling pump's AFFECTED tab", async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(makeAsset("p2"));
    const { issues } = setup();

    const affected = await issues.getManyInternalByStatusAndAssetId({
      assetId: "p2",
      issueStatus: IssueStatus.AFFECTED,
      page: 1,
      pageSize: 10,
      search: "",
    });

    expect(affected.items.map((issue) => issue.id)).toEqual(["issue-fleet"]);
  });
});
