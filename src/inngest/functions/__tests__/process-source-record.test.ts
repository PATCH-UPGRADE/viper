// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { sourceRecord: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ default: mockPrisma }));

// The Inngest client pulls in the whole event-schema graph; this function only
// needs `createFunction` to hand back its handler.
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

const { mockSourceAdapterFor, mockRunPipeline } = vi.hoisted(() => ({
  mockSourceAdapterFor: vi.fn(),
  mockRunPipeline: vi.fn(),
}));
vi.mock("@/features/integrations/core/registry", () => ({
  sourceAdapterFor: mockSourceAdapterFor,
}));
vi.mock("@/features/inbox/pipeline", () => ({
  runNotificationPipeline: mockRunPipeline,
}));

const { processSourceRecord } = await import("../process-source-record");

const step = { run: <T>(_id: string, fn: () => Promise<T>) => fn() };

const run = () =>
  // biome-ignore lint/suspicious/noExplicitAny: the handler's Inngest ctx is stubbed
  (processSourceRecord as any)({
    event: { data: { sourceRecordId: "src-1" } },
    step,
  });

const linkEntities = vi.fn();
const doc = { from: "Somewhere", subject: "A title", markdown: "# A title" };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.sourceRecord.findUnique.mockResolvedValue({
    raw: { anything: "the platform understands" },
    links: [],
    mapping: { integration: { platform: "MEDISAO" } },
  });
  mockSourceAdapterFor.mockReturnValue({
    prepare: () => ({ doc, linkEntities }),
  });
  mockRunPipeline.mockResolvedValue({ notificationId: "notif-1" });
});

describe("processSourceRecord", () => {
  it("asks the registry which platform owns this snapshot", async () => {
    await run();
    expect(mockSourceAdapterFor).toHaveBeenCalledWith("MEDISAO");
  });

  it("runs the pipeline with whatever that platform's adapter returned", async () => {
    await run();

    const [input] = mockRunPipeline.mock.calls[0];
    expect(input.sourceId).toBe("src-1");
    expect(input.doc).toEqual(doc);
    expect(input.linkEntities).toBe(linkEntities);
  });

  it("forwards the facts the adapter stated for itself", async () => {
    mockSourceAdapterFor.mockReturnValue({
      prepare: () => ({ doc, linkEntities, known: { tlp: "AMBER" } }),
    });

    await run();

    expect(mockRunPipeline.mock.calls[0][0].known).toEqual({ tlp: "AMBER" });
  });

  it("states nothing when the adapter states nothing", async () => {
    await run();
    expect(mockRunPipeline.mock.calls[0][0].known).toBeUndefined();
  });

  it("hands the adapter the stored raw, untouched", async () => {
    const prepare = vi.fn().mockReturnValue({ doc, linkEntities });
    mockSourceAdapterFor.mockReturnValue({ prepare });

    await run();

    expect(prepare).toHaveBeenCalledWith({
      anything: "the platform understands",
    });
  });

  it("works for any platform, naming none", async () => {
    mockPrisma.sourceRecord.findUnique.mockResolvedValue({
      raw: {},
      links: [],
      mapping: { integration: { platform: "SOME_FUTURE_PLATFORM" } },
    });

    await run();

    expect(mockSourceAdapterFor).toHaveBeenCalledWith("SOME_FUTURE_PLATFORM");
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  it("fails loudly when the snapshot is gone", async () => {
    mockPrisma.sourceRecord.findUnique.mockResolvedValue(null);
    await expect(run()).rejects.toThrow(/No SourceRecord src-1/);
  });

  // The sync re-emits anything without a link, so a snapshot can arrive again
  // while its first run is still going. Running the agents twice costs money.
  it("does nothing for a snapshot that already produced a notification", async () => {
    mockPrisma.sourceRecord.findUnique.mockResolvedValue({
      raw: {},
      links: [{ id: "link-1" }],
      mapping: { integration: { platform: "MEDISAO" } },
    });

    const result = await run();

    expect(result).toEqual({
      sourceRecordId: "src-1",
      skipped: "already-processed",
    });
    expect(mockRunPipeline).not.toHaveBeenCalled();
    expect(mockSourceAdapterFor).not.toHaveBeenCalled();
  });

  it("fails loudly on a snapshot with no integration behind it", async () => {
    mockPrisma.sourceRecord.findUnique.mockResolvedValue({
      raw: {},
      links: [],
      mapping: null,
    });
    await expect(run()).rejects.toThrow(/no integration mapping/);
  });

  it("fails loudly when the platform declares no adapter", async () => {
    mockSourceAdapterFor.mockReturnValue(undefined);
    await expect(run()).rejects.toThrow(/declares no SourceRecordAdapter/);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });
});
