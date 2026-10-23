// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockUpsertFeedRecord } = vi.hoisted(() => ({
  mockPrisma: {
    vulnerability: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    metric: { findFirst: vi.fn() },
  },
  mockUpsertFeedRecord: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/features/vulnerabilities/server/feed-records", () => ({
  upsertFeedRecord: mockUpsertFeedRecord,
}));
// records.ts pulls in webhooks and tRPC; enrichment only needs the CVSS types.
vi.mock("@/features/vulnerabilities/server/records", () => ({
  CVSS_METRIC_TYPES: ["CVSS_V3_0", "CVSS_V3_1", "CVSS_V4_0"],
}));

// The functions under test only need `createFunction` to hand back its handler.
vi.mock("../../client", () => ({
  inngest: {
    createFunction: (
      _config: unknown,
      _trigger: unknown,
      // biome-ignore lint/suspicious/noExplicitAny: the handler is what we exercise
      handler: any,
    ) => handler,
  },
}));

import {
  computeVulnerabilityPriority,
  enrichAllVulnerabilities,
  enrichVulnerability,
} from "../enrich-vulnerabilities";

const CVE = "CVE-2024-1234";
const EPSS_URL = "https://api.first.org/data/v1/epss";
const KEV_URL = "https://www.cisa.gov";

// A fake `step` that runs everything inline.
const makeStep = () => ({
  // biome-ignore lint/suspicious/noExplicitAny: mirrors Inngest's step.run
  run: vi.fn(async (_name: string, fn: any) => fn()),
  sendEvent: vi.fn(),
});

// biome-ignore lint/suspicious/noExplicitAny: handlers are typed by Inngest
const enrich = enrichVulnerability as any;
// biome-ignore lint/suspicious/noExplicitAny: handlers are typed by Inngest
const enrichAll = enrichAllVulnerabilities as any;

const fetchMock = vi.fn();

/** Answer FIRST with `epss` (or a status), and CISA with a catalog of `kev`. */
function respond({
  epss,
  epssStatus = 200,
  kev = [],
  kevStatus = 200,
}: {
  epss?: { epss: string; percentile: string } | null;
  epssStatus?: number;
  kev?: string[];
  kevStatus?: number;
}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith(EPSS_URL)) {
      return new Response(
        JSON.stringify({ data: epss ? [{ cve: CVE, ...epss }] : [] }),
        { status: epssStatus },
      );
    }
    if (url.startsWith(KEV_URL)) {
      return new Response(
        JSON.stringify({ vulnerabilities: kev.map((cveID) => ({ cveID })) }),
        { status: kevStatus },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

function hasVulnerability({
  cves = [CVE],
  cvss = 9.8,
}: {
  cves?: string[];
  cvss?: number | null;
} = {}) {
  mockPrisma.vulnerability.findUnique.mockResolvedValue({
    id: "v-1",
    // As the query asks: CVE identifiers only, oldest first, at most one.
    identifiers: cves.slice(0, 1).map((value) => ({ value })),
  });
  mockPrisma.metric.findFirst.mockResolvedValue(
    cvss === null ? null : { score: { toNumber: () => cvss } },
  );
}

const run = (data: { vulnerabilityId: string; kevIds?: string[] }) =>
  enrich({ event: { data }, step: makeStep() });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("computeVulnerabilityPriority", () => {
  it.each([
    [0.5, 9.8, true, "Critical"],
    [0.01, 5.0, true, "Monitor"],
    [0.1, 7.0, false, "High"],
    [0.1, 6.9, false, "Monitor"],
    [0.05, 9.8, false, "Defer"],
    [null, 9.8, true, "Unsorted"],
    [0.5, null, true, "Unsorted"],
  ] as const)("epss %s, cvss %s, KEV %s → %s", (epss, cvss, kev, expected) => {
    expect(computeVulnerabilityPriority(epss, cvss, kev)).toBe(expected);
  });
});

describe("enrichVulnerability", () => {
  it("skips a vulnerability with no CVE identifier", async () => {
    hasVulnerability({ cves: [] });

    const result = await run({ vulnerabilityId: "v-1" });

    expect(result).toEqual({ skipped: true, reason: "no CVE ID" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockUpsertFeedRecord).not.toHaveBeenCalled();
  });

  it("writes the EPSS and KEV records and the legacy columns", async () => {
    hasVulnerability({ cvss: 9.8 });
    respond({ epss: { epss: "0.2", percentile: "0.95" } });

    const result = await run({ vulnerabilityId: "v-1", kevIds: [CVE] });

    expect(mockUpsertFeedRecord).toHaveBeenCalledWith({
      vulnerabilityId: "v-1",
      cve: CVE,
      metric: { source: "FIRST_EPSS", score: 0.2, percentile: 0.95 },
      raw: { cve: CVE, epss: "0.2", percentile: "0.95" },
    });
    expect(mockUpsertFeedRecord).toHaveBeenCalledWith({
      vulnerabilityId: "v-1",
      cve: CVE,
      metric: { source: "CISA_KEV", inKev: true },
    });
    expect(mockPrisma.vulnerability.update).toHaveBeenCalledWith({
      where: { id: "v-1" },
      data: expect.objectContaining({
        epss: 0.2,
        inKEV: true,
        priority: "Critical",
      }),
    });
    expect(result).toMatchObject({ enriched: true, priority: "Critical" });
  });

  it("uses kevIds from a batch event without fetching the KEV feed", async () => {
    hasVulnerability();
    respond({ epss: { epss: "0.2", percentile: "0.9" } });

    await run({ vulnerabilityId: "v-1", kevIds: [] });

    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls.some((url) => url.startsWith(KEV_URL))).toBe(false);
    expect(mockUpsertFeedRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: { source: "CISA_KEV", inKev: false },
      }),
    );
  });

  it("fetches the KEV feed once on a standalone event", async () => {
    hasVulnerability();
    respond({ epss: { epss: "0.2", percentile: "0.9" }, kev: [CVE] });

    await run({ vulnerabilityId: "v-1" });

    const kevCalls = fetchMock.mock.calls.filter(([url]) =>
      (url as string).startsWith(KEV_URL),
    );
    expect(kevCalls).toHaveLength(1);
    expect(mockUpsertFeedRecord).toHaveBeenCalledWith(
      expect.objectContaining({ metric: { source: "CISA_KEV", inKev: true } }),
    );
  });

  it("leaves EPSS alone when FIRST has no score for the CVE", async () => {
    hasVulnerability();
    respond({ epss: null });

    await run({ vulnerabilityId: "v-1", kevIds: [] });

    const sources = mockUpsertFeedRecord.mock.calls.map(
      ([input]) => input.metric.source,
    );
    expect(sources).toEqual(["CISA_KEV"]);
    const { data } = mockPrisma.vulnerability.update.mock.calls[0][0];
    expect(data).not.toHaveProperty("epss");
    expect(data).not.toHaveProperty("updatedEpss");
    expect(data.priority).toBe("Unsorted");
  });

  it("computes priority from the newest CVSS metric", async () => {
    hasVulnerability({ cvss: 5.0 });
    respond({ epss: { epss: "0.5", percentile: "0.9" } });

    await run({ vulnerabilityId: "v-1", kevIds: [] });

    const { data } = mockPrisma.vulnerability.update.mock.calls[0][0];
    expect(data.priority).toBe("Monitor");
  });

  it("throws when FIRST fails, so the step retries", async () => {
    hasVulnerability();
    respond({ epss: null, epssStatus: 503 });

    await expect(run({ vulnerabilityId: "v-1", kevIds: [] })).rejects.toThrow(
      /FIRST EPSS request failed/,
    );
    expect(mockUpsertFeedRecord).not.toHaveBeenCalled();
  });

  it("throws when the KEV feed fails, instead of marking the CVE not listed", async () => {
    hasVulnerability();
    respond({ epss: { epss: "0.2", percentile: "0.9" }, kevStatus: 500 });

    await expect(run({ vulnerabilityId: "v-1" })).rejects.toThrow(
      /CISA KEV feed request failed/,
    );
    expect(mockUpsertFeedRecord).not.toHaveBeenCalled();
  });
});

describe("enrichAllVulnerabilities", () => {
  it("sends one event per vulnerability with a CVE identifier", async () => {
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: "v-1" },
      { id: "v-2" },
    ]);
    respond({ kev: [CVE] });
    const step = makeStep();

    const result = await enrichAll({ step });

    expect(step.sendEvent).toHaveBeenCalledWith("trigger-enrichments", [
      {
        name: "vulnerability/enrich.requested",
        data: { vulnerabilityId: "v-1", kevIds: [CVE] },
      },
      {
        name: "vulnerability/enrich.requested",
        data: { vulnerabilityId: "v-2", kevIds: [CVE] },
      },
    ]);
    expect(result).toEqual({ enrichedCount: 2 });
  });

  it("sends nothing when the KEV feed fails", async () => {
    mockPrisma.vulnerability.findMany.mockResolvedValue([{ id: "v-1" }]);
    respond({ kevStatus: 500 });
    const step = makeStep();

    await expect(enrichAll({ step })).rejects.toThrow();
    expect(step.sendEvent).not.toHaveBeenCalled();
  });
});
