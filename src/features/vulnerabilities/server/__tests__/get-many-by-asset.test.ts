// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockGetSession, mockFind, mockFetchPaginated } = vi.hoisted(
  () => ({
    mockPrisma: {
      asset: { findUnique: vi.fn() },
      version: { findUnique: vi.fn() },
    },
    mockGetSession: vi.fn(),
    mockFind: vi.fn(),
    mockFetchPaginated: vi.fn(),
  }),
);

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/lib/auth-utils", () => ({
  getSession: mockGetSession,
  verifyApiKey: vi.fn(),
}));
vi.mock("@/features/notes/server/get-relevant-notes", () => ({
  attachNote: vi.fn((_, row) => row),
  attachNotes: vi.fn(async (_, rows) => rows),
}));
vi.mock("@/lib/router-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/router-utils")>()),
  findVulnerabilitiesMatchingDevices: mockFind,
  fetchPaginated: mockFetchPaginated,
}));

import { Prisma } from "@/generated/prisma";
import { createCallerFactory } from "@/trpc/init";
import { vulnerabilitiesRouter } from "../routers";

const caller = () => {
  mockGetSession.mockResolvedValue({
    user: { id: "user-test" },
    session: { id: "session-1", userId: "user-test" },
  });
  // biome-ignore lint/suspicious/noExplicitAny: test stub for tRPC ctx
  return createCallerFactory(vulnerabilitiesRouter)({ req: {} as any });
};

const pump = {
  id: "asset-1",
  manufacturerId: "mf-baxter",
  productId: "prod-sigma",
  versionId: "ver-8",
  version: { canonicalName: "8.0" },
};

const emptyPage = {
  items: [],
  page: 1,
  pageSize: 10,
  totalCount: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

const user = {
  id: "user-test",
  name: "Test",
  email: "test@example.com",
  image: null,
};
const at = new Date("2026-01-01T00:00:00Z");

/** A row as prisma returns it with vulnerabilityInclude. */
const vulnerabilityRow = {
  id: "vuln-1",
  displayId: "CVE-2026-0001",
  description: "Pump overflow",
  narrative: null,
  impact: null,
  severity: "High",
  identifiers: [{ value: "CVE-2026-0001", displayValue: "CVE-2026-0001" }],
  records: [
    {
      id: "record-1",
      vulnerabilityId: "vuln-1",
      source: "TA3",
      sourceId: null,
      summary: "Pump overflow",
      details: null,
      publishedAt: null,
      userId: user.id,
      user,
      raw: null,
      metrics: [
        {
          id: "metric-1",
          recordId: "record-1",
          type: "CVSS_V3_1",
          vector: null,
          score: new Prisma.Decimal(8.1),
          percentile: null,
          severity: "High",
          createdAt: at,
          updatedAt: at,
        },
      ],
      ta3Submission: {
        id: "ta3-1",
        recordId: "record-1",
        sarif: {},
        narrative: null,
        impact: null,
        exploitUri: null,
        deviceArtifactId: null,
        alohaStatus: null,
        alohaLog: {},
        createdAt: at,
        updatedAt: at,
      },
      createdAt: at,
      updatedAt: at,
    },
  ],
  createdAt: at,
  updatedAt: at,
  cveId: "CVE-2026-0001",
  cvssScore: 8.1,
  cvssVector: null,
  epss: null,
  updatedEpss: null,
  inKEV: false,
  updatedInKev: null,
  sarif: {},
  exploitUri: null,
  affectedComponents: [],
  userId: user.id,
  user,
  deviceGroupMatchings: [],
  externalMappings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.asset.findUnique.mockResolvedValue(pump);
  mockFind.mockResolvedValue([{ id: "vuln-1" }, { id: "vuln-2" }]);
  mockFetchPaginated.mockResolvedValue(emptyPage);
});

describe("vulnerabilities.getManyByAsset", () => {
  it("lists the vulnerabilities whose matchings apply to the asset", async () => {
    await caller().getManyByAsset({ id: "asset-1" });

    expect(mockFind).toHaveBeenCalledWith([pump]);
    const [, , args] = mockFetchPaginated.mock.calls[0];
    expect(args.where).toEqual({ id: { in: ["vuln-1", "vuln-2"] } });
  });

  it("narrows the matches by the search term", async () => {
    await caller().getManyByAsset({ id: "asset-1", search: "CVE-2026" });

    const [, , args] = mockFetchPaginated.mock.calls[0];
    expect(args.where.AND).toContainEqual({
      id: { in: ["vuln-1", "vuln-2"] },
    });
    const insensitive = { contains: "CVE-2026", mode: "insensitive" };
    expect(args.where.AND).toContainEqual({
      OR: [
        { displayId: insensitive },
        { identifiers: { some: { value: insensitive } } },
        { description: insensitive },
        { impact: insensitive },
      ],
    });
  });

  it("returns identifiers and records, with metric scores as numbers", async () => {
    mockFetchPaginated.mockResolvedValue({
      ...emptyPage,
      items: [vulnerabilityRow],
      totalCount: 1,
      totalPages: 1,
    });

    const result = await caller().getManyByAsset({ id: "asset-1" });

    const [item] = result.items;
    expect(item.identifiers).toEqual([
      { value: "CVE-2026-0001", displayValue: "CVE-2026-0001" },
    ]);
    expect(item.records).toEqual([
      expect.objectContaining({
        source: "TA3",
        sourceId: null,
        summary: "Pump overflow",
        user: vulnerabilityRow.user,
        metrics: [
          expect.objectContaining({
            type: "CVSS_V3_1",
            score: 8.1,
            percentile: null,
          }),
        ],
        ta3Submission: expect.objectContaining({
          recordId: "record-1",
          vulnerabilityId: "vuln-1",
        }),
      }),
    ]);
    // Legacy flat fields stay until later in VW-540.
    expect(item.cveId).toBe("CVE-2026-0001");
  });

  it("returns NOT_FOUND for an unknown asset", async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(null);

    await expect(
      caller().getManyByAsset({ id: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockFind).not.toHaveBeenCalled();
  });
});

describe("vulnerabilities.getManyByVersion", () => {
  it("matches on the version's manufacturer, product, and version", async () => {
    mockPrisma.version.findUnique.mockResolvedValue({
      id: "ver-8",
      canonicalName: "8.0",
      productId: "prod-sigma",
      product: { manufacturerId: "mf-baxter" },
    });

    await caller().getManyByVersion({ id: "ver-8" });

    expect(mockFind).toHaveBeenCalledWith([
      {
        id: "ver-8",
        manufacturerId: "mf-baxter",
        productId: "prod-sigma",
        versionId: "ver-8",
        version: { canonicalName: "8.0" },
      },
    ]);
    const [, , args] = mockFetchPaginated.mock.calls[0];
    expect(args.where).toEqual({ id: { in: ["vuln-1", "vuln-2"] } });
  });

  it("returns NOT_FOUND for an unknown version", async () => {
    mockPrisma.version.findUnique.mockResolvedValue(null);

    await expect(
      caller().getManyByVersion({ id: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockFind).not.toHaveBeenCalled();
  });
});
