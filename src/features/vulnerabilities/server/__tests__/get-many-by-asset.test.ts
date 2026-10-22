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
