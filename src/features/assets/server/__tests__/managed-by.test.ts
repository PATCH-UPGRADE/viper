// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession } = vi.hoisted(() => ({
  mockPrisma: {
    asset: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

vi.mock("@/lib/auth-utils", () => ({
  getSession: mockGetSession,
  verifyApiKey: vi.fn(),
}));

// The notes lookup is a separate query path with its own tests. Pass rows
// through so the assertions below see only what the router itself shapes.
vi.mock("@/features/notes/server/get-relevant-notes", () => ({
  attachNotes: vi.fn(async (_scope: string, rows: unknown[]) => rows),
  attachNote: vi.fn(async (_scope: string, row: unknown) => row),
}));

import { createCallerFactory } from "@/trpc/init";
import { assetsRouter } from "../routers";

const createCaller = createCallerFactory(assetsRouter);

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

const PAGE_INPUT = {
  page: 1,
  pageSize: 10,
  search: "",
  sort: "",
  lastUpdatedStartTime: "",
  lastUpdatedEndTime: "",
} as const;

type ManagedByRow = {
  id: string;
  responsibilities: string;
  vendor: { id: string; canonicalDisplayName: string } | null;
  department: { id: string; name: string } | null;
  contract: {
    title: string | null;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
  } | null;
  workOrderIntegration: { id: string; name: string; platform: string } | null;
};

const makeAssetRow = (managedBy: ManagedByRow[]) => ({
  id: "asset-1",
  ip: "10.40.1.60",
  role: "MRI Scanner",
  networkSegment: null,
  hostname: "MR-MAGNETOM-001",
  macAddress: null,
  serialNumber: "SH-MAG-2021-001",
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
  deviceGroup: {
    id: "dg-1",
    manufacturer: {
      canonicalName: "siemens healthineers",
      canonicalDisplayName: "Siemens Healthineers",
    },
    product: null,
    version: null,
    versionStatus: "KNOWN",
    cpe: [],
    udi: null,
    url: "http://localhost:3000/api/v1/deviceGroups/dg-1",
    sbomUrl: null,
    vulnerabilitiesUrl:
      "http://localhost:3000/api/v1/deviceGroups/dg-1/vulnerabilities",
    deviceArtifactsUrl:
      "http://localhost:3000/api/v1/deviceGroups/dg-1/emulators",
    assetsUrl: "http://localhost:3000/api/v1/deviceGroups/dg-1/assets",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  },
  externalMappings: [],
  managedBy,
});

const CONTRACTED_FLEET: ManagedByRow = {
  id: "rel-1",
  responsibilities:
    "Managed security and maintenance for imaging equipment under contract.",
  vendor: { id: "vendor-1", canonicalDisplayName: "Siemens Healthineers" },
  department: null,
  contract: {
    title: "Imaging Fleet Managed Service Agreement",
    effectiveFrom: new Date("2024-01-01"),
    effectiveTo: new Date("2027-12-31"),
  },
  workOrderIntegration: {
    id: "integration-1",
    name: "Siemens Healthineers teamplay Fleet",
    platform: "FLEET",
  },
};

const UNCONTRACTED_FLEET: ManagedByRow = {
  id: "rel-2",
  responsibilities:
    "Serviced by Siemens Healthineers — synced from the teamplay Fleet equipment inventory.",
  vendor: { id: "vendor-1", canonicalDisplayName: "Siemens Healthineers" },
  department: null,
  contract: null,
  workOrderIntegration: {
    id: "integration-1",
    name: "Siemens Healthineers teamplay Fleet",
    platform: "FLEET",
  },
};

const IN_HOUSE: ManagedByRow = {
  id: "rel-3",
  responsibilities: "Biomed services this device in house.",
  vendor: null,
  department: { id: "dept-1", name: "Clinical Engineering" },
  contract: null,
  workOrderIntegration: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.asset.count.mockResolvedValue(1);
});

describe("assetsRouter.getMany managedBy", () => {
  it("reports a contract with its effective window", async () => {
    mockPrisma.asset.findMany.mockResolvedValue([
      makeAssetRow([CONTRACTED_FLEET]),
    ]);

    const result = await setup().getMany(PAGE_INPUT);

    expect(result.items[0].managedBy).toEqual([CONTRACTED_FLEET]);
  });

  // The Fleet equipment sync creates a relationship with no contract. Both
  // shapes are real, so a null contract must survive rather than drop the row.
  it("reports a Fleet relationship that has no contract", async () => {
    mockPrisma.asset.findMany.mockResolvedValue([
      makeAssetRow([UNCONTRACTED_FLEET]),
    ]);

    const [relationship] = (await setup().getMany(PAGE_INPUT)).items[0]
      .managedBy;

    expect(relationship.contract).toBeNull();
    expect(relationship.workOrderIntegration?.platform).toBe("FLEET");
  });

  it("reports an in-house owner with no vendor and no filing platform", async () => {
    mockPrisma.asset.findMany.mockResolvedValue([makeAssetRow([IN_HOUSE])]);

    const [relationship] = (await setup().getMany(PAGE_INPUT)).items[0]
      .managedBy;

    expect(relationship.vendor).toBeNull();
    expect(relationship.department?.name).toBe("Clinical Engineering");
    expect(relationship.workOrderIntegration).toBeNull();
  });

  it("returns an empty array when no owner is recorded", async () => {
    mockPrisma.asset.findMany.mockResolvedValue([makeAssetRow([])]);

    const result = await setup().getMany(PAGE_INPUT);

    expect(result.items[0].managedBy).toEqual([]);
  });

  // The output schema strips unlisted keys, so a schema without a matching
  // include yields an empty field rather than an error. Pin the include too.
  it("queries the relationship, its contract, and its filing platform", async () => {
    mockPrisma.asset.findMany.mockResolvedValue([makeAssetRow([])]);

    await setup().getMany(PAGE_INPUT);

    const [args] = mockPrisma.asset.findMany.mock.calls[0];
    const { select } = args.include.managedBy;
    expect(select.contract).toBeDefined();
    expect(select.workOrderIntegration).toBeDefined();
  });
});

describe("assetsRouter.getOne managedBy", () => {
  it("reports the same shape for one asset", async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(
      makeAssetRow([CONTRACTED_FLEET]),
    );

    const asset = await setup().getOne({ id: "asset-1" });

    expect(asset.managedBy).toEqual([CONTRACTED_FLEET]);
  });
});
