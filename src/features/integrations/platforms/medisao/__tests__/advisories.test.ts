// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResourceSyncCtx, Session } from "../../../core/types";
import type { MedIsaoConfig, MedIsaoCreds } from "../config";

vi.mock("server-only", () => ({}));

const prismaMock = {
  externalSourceRecordMapping: {
    findMany: vi.fn(),
    createManyAndReturn: vi.fn(),
    updateMany: vi.fn(),
  },
  sourceRecord: { findMany: vi.fn(), createManyAndReturn: vi.fn() },
};
vi.mock("@/lib/db", () => ({ default: prismaMock }));

const send = vi.fn();
vi.mock("@/inngest/client", () => ({ inngest: { send } }));

const request = vi.fn();
vi.mock("../session", () => ({
  createMedIsaoSession: (): Session => ({ request }),
}));

const { rawAdvisorySchema, toCanonical, toMarkdown } = await import(
  "../advisories/feed"
);
const { syncAdvisories } = await import("../advisories/sync");

const API = "https://dev.example.test";

/** Captured verbatim from GET /channels/{id}/advisories on the dev instance. */
const LIVE_ADVISORY = {
  id: "055b56f2-c9c4-4b41-a79c-b18d52fac820",
  channel: { vendor: "ViperMD", product: "ViperDevice" },
  name: "Test Vuln 1",
  description: "This is a test vuln",
  version: null,
  version_text: null,
  tlp: "CLEAR",
  linked_vulnerabilities: ["TEST-2026-0001"],
  source_type: "manual",
  url: "",
  published_at: "2026-08-14T03:04:48.479560Z",
  updated_at: "2026-08-14T03:04:48.479712Z",
};

const advisory = (over: Record<string, unknown> = {}) => ({
  ...LIVE_ADVISORY,
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
    creds: {},
    cursor: null,
    lastSuccessfulSync: null,
    callback: vi.fn(),
    ...over,
  }) as ResourceSyncCtx<MedIsaoConfig, MedIsaoCreds>;

const serve = (
  channels: string[],
  byChannel: Record<string, Response | (() => Response)>,
) => {
  request.mockImplementation(async (url: string) => {
    if (url.includes("/advisories")) {
      const id = url.split("/channels/")[1].split("/")[0];
      const entry = byChannel[id];
      if (!entry) return page([]);
      return typeof entry === "function" ? entry() : entry;
    }
    return page(
      channels.map((id) => ({
        id,
        vendor: "ViperMD",
        product: "ViperDevice",
        updated_at: "2026-08-01T00:00:00.000Z",
      })),
    );
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.externalSourceRecordMapping.findMany.mockResolvedValue([]);
  prismaMock.externalSourceRecordMapping.createManyAndReturn.mockImplementation(
    async ({ data }: { data: { externalId: string }[] }) =>
      data.map((row, i) => ({ id: `map-${i}`, externalId: row.externalId })),
  );
  prismaMock.externalSourceRecordMapping.updateMany.mockResolvedValue({});
  prismaMock.sourceRecord.findMany.mockResolvedValue([]);
  prismaMock.sourceRecord.createManyAndReturn.mockImplementation(
    async ({ data }: { data: unknown[] }) =>
      data.map((_row, i) => ({ id: `src-${i}` })),
  );
  send.mockResolvedValue(undefined);
});

describe("the advisory feed", () => {
  it("parses the live payload", () => {
    expect(() => rawAdvisorySchema.parse(LIVE_ADVISORY)).not.toThrow();
  });

  it("takes the device identity from the channel", () => {
    const item = toCanonical(
      rawAdvisorySchema.parse(LIVE_ADVISORY),
      API,
      "chan-1",
    );
    expect(item.manufacturer).toBe("ViperMD");
    expect(item.product).toBe("ViperDevice");
    expect(item.vulnerabilityIds).toEqual(["TEST-2026-0001"]);
  });

  it("reads the feed's empty url as no url at all", () => {
    const item = toCanonical(
      rawAdvisorySchema.parse(LIVE_ADVISORY),
      API,
      "chan-1",
    );
    expect(item.webUrl).toBeNull();
  });

  it("keeps a real url", () => {
    const item = toCanonical(
      rawAdvisorySchema.parse(advisory({ url: "https://vendor.test/a" })),
      API,
      "chan-1",
    );
    expect(item.webUrl).toBe("https://vendor.test/a");
  });

  it("falls back to the id when the advisory has no name", () => {
    const item = toCanonical(
      rawAdvisorySchema.parse(advisory({ name: null })),
      API,
      "chan-1",
    );
    expect(item.title).toBe(`MedISAO advisory ${LIVE_ADVISORY.id}`);
  });

  it("joins the title and prose into one body for the agents", () => {
    const markdown = toMarkdown(rawAdvisorySchema.parse(LIVE_ADVISORY));
    expect(markdown).toContain("# Test Vuln 1");
    expect(markdown).toContain("This is a test vuln");
  });

  it("carries the affected-version text into the body", () => {
    const markdown = toMarkdown(
      rawAdvisorySchema.parse(advisory({ version_text: "6.0.2 and earlier" })),
    );
    expect(markdown).toContain("Affected versions: 6.0.2 and earlier");
  });
});

describe("syncAdvisories", () => {
  it("records a snapshot and wakes the pipeline for it", async () => {
    serve(["chan-1"], { "chan-1": page([advisory()]) });

    await syncAdvisories(ctx());

    const [[{ data }]] = prismaMock.sourceRecord.createManyAndReturn.mock.calls;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      channel: "Integration",
      mappingId: "map-0",
    });

    expect(send).toHaveBeenCalledWith([
      {
        name: "inbox/source-record.recorded",
        data: { sourceRecordId: "src-0" },
      },
    ]);
  });

  it("writes nothing when the advisory is unchanged", async () => {
    serve(["chan-1"], { "chan-1": page([advisory()]) });
    prismaMock.externalSourceRecordMapping.findMany.mockResolvedValue([
      { id: "map-existing", externalId: LIVE_ADVISORY.id },
    ]);

    // Take the hash the sync itself computes, so the fixture cannot drift.
    await syncAdvisories(ctx());
    const written =
      prismaMock.sourceRecord.createManyAndReturn.mock.calls[0][0].data[0];
    vi.clearAllMocks();
    prismaMock.externalSourceRecordMapping.findMany.mockResolvedValue([
      { id: "map-existing", externalId: LIVE_ADVISORY.id },
    ]);
    prismaMock.sourceRecord.findMany.mockResolvedValue([
      { mappingId: "map-existing", contentHash: written.contentHash },
    ]);
    serve(["chan-1"], { "chan-1": page([advisory()]) });

    await syncAdvisories(ctx());

    expect(prismaMock.sourceRecord.createManyAndReturn).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("records a new snapshot when the advisory was revised", async () => {
    prismaMock.externalSourceRecordMapping.findMany.mockResolvedValue([
      { id: "map-existing", externalId: LIVE_ADVISORY.id },
    ]);
    prismaMock.sourceRecord.findMany.mockResolvedValue([
      { mappingId: "map-existing", contentHash: "a-stale-hash" },
    ]);
    serve(["chan-1"], {
      "chan-1": page([advisory({ description: "now with more detail" })]),
    });

    await syncAdvisories(ctx());

    expect(prismaMock.sourceRecord.createManyAndReturn).toHaveBeenCalledTimes(
      1,
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("returns the newest updated_at per channel", async () => {
    serve(["chan-1"], {
      "chan-1": page([
        advisory({ id: "a", updated_at: "2026-08-14T00:00:00.000Z" }),
        advisory({ id: "b", updated_at: "2026-09-02T00:00:00.000Z" }),
      ]),
    });

    const outcome = await syncAdvisories(ctx());

    expect(outcome.cursor).toEqual({ "chan-1": "2026-09-02T00:00:00.000Z" });
  });

  it("skips a channel that vanished", async () => {
    serve(["gone", "chan-2"], {
      gone: () => new Response("", { status: 404 }),
      "chan-2": page([advisory({ id: "kept" })]),
    });

    const outcome = await syncAdvisories(ctx());

    const [[{ data }]] =
      prismaMock.externalSourceRecordMapping.createManyAndReturn.mock.calls;
    expect(data.map((d: { externalId: string }) => d.externalId)).toEqual([
      "kept",
    ]);
    expect(outcome.cursor).not.toHaveProperty("gone");
  });

  it("sends no event when nothing changed", async () => {
    serve(["chan-1"], {});

    await syncAdvisories(ctx());

    expect(send).not.toHaveBeenCalled();
  });
});
