// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResourceSyncCtx, Session } from "../../../core/types";
import type { MedIsaoConfig, MedIsaoCreds } from "../config";

vi.mock("server-only", () => ({}));

const prismaMock = {
  integration: { findUniqueOrThrow: vi.fn() },
  vulnerability: { findMany: vi.fn() },
  remediation: {},
  externalRemediationMapping: {},
};
vi.mock("@/lib/db", () => ({ default: prismaMock }));

const processIntegrationSync = vi.fn();
vi.mock("@/features/integrations/core/sync/upsert", () => ({
  processIntegrationSync: (...args: unknown[]) =>
    processIntegrationSync(...args),
}));

const resolveMatchingId = vi.fn();
vi.mock("@/lib/router-utils", () => ({
  resolveMatchingId: (...args: unknown[]) => resolveMatchingId(...args),
}));

const request = vi.fn();
vi.mock("../session", () => ({
  createMedIsaoSession: (): Session => ({ request }),
}));

const { describeRemediation, syncRemediations } = await import(
  "../remediations/sync"
);

const API = "https://dev.example.test";

const remediation = (over: Record<string, unknown> = {}) => ({
  id: "rem-1",
  channel: { vendor: "ViperMD", product: "ViperDevice" },
  advisory_id: "adv-1",
  version: null,
  tlp: "CLEAR",
  category: "mitigation",
  mechanism: "firmware_patch",
  description: "patch it",
  narrative: "how to patch it",
  fixed_vulnerabilities: [],
  requires_downtime: true,
  estimated_downtime_seconds: 5400,
  restart_required: true,
  disables_features: false,
  workflow_impact: "imaging paused",
  clinical_impact_notes: "schedule outside clinic hours",
  files: [],
  updated_at: "2026-08-27T17:21:33.000Z",
  ...over,
});

const page = (results: unknown[]) =>
  new Response(JSON.stringify({ next: null, previous: null, results }), {
    status: 200,
  });

const ctx = (
  over: Partial<ResourceSyncCtx<MedIsaoConfig, MedIsaoCreds>> = {},
): ResourceSyncCtx<MedIsaoConfig, MedIsaoCreds> =>
  ({
    integrationId: "int-1",
    config: { apiUrl: API },
    creds: { apiToken: "test-token" },
    cursor: null,
    lastSuccessfulSync: null,
    callback: vi.fn(),
    ...over,
  }) as ResourceSyncCtx<MedIsaoConfig, MedIsaoCreds>;

/** Serves the channel list, then one remediation page per channel. */
const serve = (
  channels: { id: string; product?: string | null }[],
  byChannel: Record<string, Response | (() => Response)>,
) => {
  request.mockImplementation(async (url: string) => {
    if (url.includes("/remediations")) {
      const id = url.split("/channels/")[1].split("/")[0];
      const entry = byChannel[id];
      if (!entry) return page([]);
      return typeof entry === "function" ? entry() : entry;
    }
    return page(
      channels.map((c) => ({
        id: c.id,
        vendor: "ViperMD",
        product: c.product ?? "ViperDevice",
        updated_at: "2026-08-01T00:00:00.000Z",
      })),
    );
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.integration.findUniqueOrThrow.mockResolvedValue({
    integrationUserId: "shadow-user",
  });
  prismaMock.vulnerability.findMany.mockResolvedValue([]);
  resolveMatchingId.mockResolvedValue("matching-1");
  processIntegrationSync.mockResolvedValue({ message: "success" });
});

describe("syncRemediations", () => {
  it("ingests what every channel returned", async () => {
    serve([{ id: "chan-1" }], { "chan-1": page([remediation()]) });

    await syncRemediations(ctx());

    expect(processIntegrationSync).toHaveBeenCalledTimes(1);
    const [, , input] = processIntegrationSync.mock.calls[0];
    expect(input.items).toHaveLength(1);
    expect(input.items[0].vendorId).toBe("rem-1");
  });

  it("returns the newest updated_at per channel as the next cursor", async () => {
    serve([{ id: "chan-1" }, { id: "chan-2" }], {
      "chan-1": page([
        remediation({ id: "a", updated_at: "2026-08-27T17:21:33.000Z" }),
        remediation({ id: "b", updated_at: "2026-09-01T09:00:00.000Z" }),
      ]),
      "chan-2": page([
        remediation({ id: "c", updated_at: "2026-07-04T00:00:00.000Z" }),
      ]),
    });

    const outcome = await syncRemediations(ctx());

    expect(outcome.cursor).toEqual({
      "chan-1": "2026-09-01T09:00:00.000Z",
      "chan-2": "2026-07-04T00:00:00.000Z",
    });
  });

  it("asks each channel only for what changed since its own watermark", async () => {
    serve([{ id: "chan-1" }, { id: "chan-2" }], {});

    await syncRemediations(
      ctx({
        cursor: { "chan-1": "2026-08-01T00:00:00.000Z" },
        lastSuccessfulSync: new Date("2026-05-05T00:00:00.000Z"),
      }),
    );

    const urls = request.mock.calls.map(([url]) => url as string);
    expect(urls).toContainEqual(
      expect.stringContaining(
        "/channels/chan-1/remediations?since=2026-08-01T00%3A00%3A00.000Z",
      ),
    );
    // No watermark of its own, so it falls back to the platform's last success.
    expect(urls).toContainEqual(
      expect.stringContaining(
        "/channels/chan-2/remediations?since=2026-05-05T00%3A00%3A00.000Z",
      ),
    );
  });

  it("keeps a cursor it cannot read from skipping the window", async () => {
    serve([{ id: "chan-1" }], {});

    await syncRemediations(ctx({ cursor: "not-an-object" }));

    const urls = request.mock.calls.map(([url]) => url as string);
    expect(urls.some((url) => url.includes("since="))).toBe(false);
  });

  it("skips a channel that vanished, and still ingests the rest", async () => {
    serve([{ id: "gone" }, { id: "chan-2" }], {
      gone: () => new Response("", { status: 404 }),
      "chan-2": page([remediation({ id: "still-here" })]),
    });

    const outcome = await syncRemediations(ctx());

    const [, , input] = processIntegrationSync.mock.calls[0];
    expect(input.items.map((i: { vendorId: string }) => i.vendorId)).toEqual([
      "still-here",
    ]);
    expect(outcome.cursor).not.toHaveProperty("gone");
  });

  it("fails the attempt on a fault that is not a 404", async () => {
    serve([{ id: "chan-1" }], {
      "chan-1": () => new Response("", { status: 500 }),
    });

    await expect(syncRemediations(ctx())).rejects.toThrow(/500/);
    expect(processIntegrationSync).not.toHaveBeenCalled();
  });

  // A partial failure does not throw: the ingest helper collects per-item
  // errors and reports shouldRetry. Advancing past them would drop them.
  it("holds the watermark when some items failed to land", async () => {
    serve([{ id: "chan-1" }], {
      "chan-1": page([remediation({ updated_at: "2026-09-01T00:00:00.000Z" })]),
    });
    processIntegrationSync.mockResolvedValue({
      message: "1 of 1 items failed: boom",
      shouldRetry: true,
    });

    const outcome = await syncRemediations(
      ctx({ cursor: { "chan-1": "2026-08-01T00:00:00.000Z" } }),
    );

    expect(outcome.cursor).toEqual({ "chan-1": "2026-08-01T00:00:00.000Z" });
  });

  it("advances the watermark when every item landed", async () => {
    serve([{ id: "chan-1" }], {
      "chan-1": page([remediation({ updated_at: "2026-09-01T00:00:00.000Z" })]),
    });

    const outcome = await syncRemediations(
      ctx({ cursor: { "chan-1": "2026-08-01T00:00:00.000Z" } }),
    );

    expect(outcome.cursor).toEqual({ "chan-1": "2026-09-01T00:00:00.000Z" });
  });

  it("does not ingest when nothing changed", async () => {
    serve([{ id: "chan-1" }], {});

    const outcome = await syncRemediations(ctx());

    expect(processIntegrationSync).not.toHaveBeenCalled();
    expect(outcome.cursor).toEqual({});
  });
});

describe("the description we store", () => {
  // Viper keeps one vulnerability per remediation and MedISAO lists many, so
  // anything unresolved would otherwise vanish: the sync stores no raw payload.
  it("names every vulnerability the remediation claims to fix", () => {
    expect(
      describeRemediation({
        description: "patch it",
        fixedVulnerabilities: ["CVE-2026-0001", "GHSA-abc", "VENDOR-7"],
      }),
    ).toBe("patch it\n\nFixes: CVE-2026-0001, GHSA-abc, VENDOR-7");
  });

  it("names the one we did link, so the text does not depend on what Viper holds", () => {
    expect(
      describeRemediation({
        description: "patch it",
        fixedVulnerabilities: ["CVE-2026-0001"],
      }),
    ).toBe("patch it\n\nFixes: CVE-2026-0001");
  });

  it("stands alone when the feed gave no description", () => {
    expect(
      describeRemediation({
        description: null,
        fixedVulnerabilities: ["CVE-2026-0001"],
      }),
    ).toBe("Fixes: CVE-2026-0001");
  });

  it("leaves the description alone when nothing is fixed", () => {
    expect(
      describeRemediation({
        description: "patch it",
        fixedVulnerabilities: [],
      }),
    ).toBe("patch it");
    expect(
      describeRemediation({ description: null, fixedVulnerabilities: [] }),
    ).toBeNull();
  });

  // A re-sync rebuilds this from the feed, so the row must not drift.
  it("produces the same text every time", () => {
    const item = {
      description: "patch it",
      fixedVulnerabilities: ["CVE-2026-0001", "CVE-2026-0002"],
    };
    expect(describeRemediation(item)).toBe(describeRemediation(item));
  });
});

describe("the ingest mapping", () => {
  /** Run the sync, then drive the transform the ingest helper was handed. */
  const transformOf = async (over: Record<string, unknown> = {}) => {
    serve([{ id: "chan-1" }], { "chan-1": page([remediation(over)]) });
    await syncRemediations(ctx());
    const [, config, input] = processIntegrationSync.mock.calls[0];
    return config.transformInputItem(input.items[0], "shadow-user");
  };

  it("carries the manufacturer impact onto the row", async () => {
    const { createData } = await transformOf();

    expect(createData.description).toBe("patch it");
    expect(createData.narrative).toBe("how to patch it");
    expect(createData.sourceImpact).toEqual({
      category: "mitigation",
      mechanism: "firmware_patch",
      requiresDowntime: true,
      estimatedDowntimeSeconds: 5400,
      restartRequired: true,
      disablesFeatures: false,
      workflowImpact: "imaging paused",
      clinicalImpactNotes: "schedule outside clinic hours",
    });
  });

  it("writes the fixed vulnerabilities onto the row, held or not", async () => {
    prismaMock.vulnerability.findMany.mockResolvedValue([
      { id: "vuln-1", cveId: "CVE-2026-0001" },
    ]);

    const { createData } = await transformOf({
      fixed_vulnerabilities: ["CVE-2026-0001", "GHSA-unknown"],
    });

    // One resolved and is linked; the other exists nowhere in Viper, so the
    // description is the only place it survives.
    expect(createData.vulnerabilityId).toBe("vuln-1");
    expect(createData.description).toContain(
      "Fixes: CVE-2026-0001, GHSA-unknown",
    );
  });

  it("resolves the channel to a device group matching, not a CPE", async () => {
    const { createData } = await transformOf({
      version: "vers:semver/<=6.0.2",
    });

    expect(resolveMatchingId).toHaveBeenCalledWith({
      manufacturer: "ViperMD",
      product: "ViperDevice",
      version: null,
      versionRange: "vers:semver/<=6.0.2",
      hasCpe: false,
    });
    expect(createData.deviceGroupMatchings).toEqual({
      connect: [{ id: "matching-1" }],
    });
  });

  // Every part of the key is free text, so a separator-joined key would let
  // "A B"+"C" and "A"+"B C" share one cache entry and one device group.
  it("does not confuse two identities whose parts differ only by spacing", async () => {
    serve([{ id: "chan-1" }], {
      "chan-1": page([
        remediation({
          id: "a",
          channel: { vendor: "Acme Medical", product: "Pump" },
        }),
        remediation({
          id: "b",
          channel: { vendor: "Acme", product: "Medical Pump" },
        }),
      ]),
    });
    resolveMatchingId
      .mockResolvedValueOnce("matching-a")
      .mockResolvedValueOnce("matching-b");

    await syncRemediations(ctx());
    const [, config, input] = processIntegrationSync.mock.calls[0];
    const first = await config.transformInputItem(input.items[0], "u");
    const second = await config.transformInputItem(input.items[1], "u");

    expect(resolveMatchingId).toHaveBeenCalledTimes(2);
    expect(first.createData.deviceGroupMatchings).toEqual({
      connect: [{ id: "matching-a" }],
    });
    expect(second.createData.deviceGroupMatchings).toEqual({
      connect: [{ id: "matching-b" }],
    });
  });

  it("keeps the creator off the update, so a re-sync cannot reassign it", async () => {
    const { updateData } = await transformOf();
    expect(updateData).not.toHaveProperty("userId");
  });

  it("links a vulnerability when exactly one identifier resolves", async () => {
    prismaMock.vulnerability.findMany.mockResolvedValue([
      { id: "vuln-1", cveId: "CVE-2026-0001" },
    ]);

    const { createData } = await transformOf({
      fixed_vulnerabilities: ["CVE-2026-0001", "GHSA-unknown"],
    });

    expect(createData.vulnerabilityId).toBe("vuln-1");
  });

  it("links none when the answer is ambiguous", async () => {
    prismaMock.vulnerability.findMany.mockResolvedValue([
      { id: "vuln-1", cveId: "CVE-2026-0001" },
      { id: "vuln-2", cveId: "CVE-2026-0002" },
    ]);

    const { createData } = await transformOf({
      fixed_vulnerabilities: ["CVE-2026-0001", "CVE-2026-0002"],
    });

    expect(createData).not.toHaveProperty("vulnerabilityId");
  });
});
