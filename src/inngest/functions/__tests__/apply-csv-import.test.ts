// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockGetChunk,
  mockDeleteChunks,
  mockLoadMatchContext,
  mockLoadCanonicalNames,
  mockApplyChunk,
  mockNameBelongsToAnother,
  mockAddManufacturerAlias,
  mockAddProductAlias,
  mockUpsertResourceSync,
} = vi.hoisted(() => ({
  mockPrisma: {
    csvImport: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  mockGetChunk: vi.fn(),
  mockDeleteChunks: vi.fn(),
  mockLoadMatchContext: vi.fn(),
  mockLoadCanonicalNames: vi.fn(),
  mockApplyChunk: vi.fn(),
  mockNameBelongsToAnother: vi.fn(),
  mockAddManufacturerAlias: vi.fn(),
  mockAddProductAlias: vi.fn(),
  mockUpsertResourceSync: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("../../client", () => ({
  inngest: {
    createFunction: (
      config: { onFailure: unknown },
      _trigger: unknown,
      handler: object,
    ) => Object.assign(handler, { onFailure: config.onFailure }),
  },
}));
vi.mock("@/features/integrations/platforms/csv-upload/import/staging", () => ({
  getChunk: mockGetChunk,
  deleteChunks: mockDeleteChunks,
}));
vi.mock("@/features/integrations/platforms/csv-upload/import/context", () => ({
  loadMatchContext: mockLoadMatchContext,
  loadCanonicalNames: mockLoadCanonicalNames,
}));
vi.mock("@/features/integrations/platforms/csv-upload/import/apply", () => ({
  applyChunk: mockApplyChunk,
}));
vi.mock("@/features/integrations/platforms/csv-upload/import/names", () => ({
  nameBelongsToAnother: mockNameBelongsToAnother,
}));
vi.mock("@/features/inbox/utils", () => ({
  addManufacturerAlias: mockAddManufacturerAlias,
  addProductAlias: mockAddProductAlias,
}));
vi.mock("@/features/integrations/core/sync/upsert", () => ({
  upsertResourceSync: mockUpsertResourceSync,
}));

import type { StagedRow } from "@/features/integrations/platforms/csv-upload/contract";
import { CsvImportStatus, ResourceType } from "@/generated/prisma";
import { applyCsvImportFn } from "../apply-csv-import";

type ImportHandler = (ctx: {
  event: { data: { importId: string } };
  step: ReturnType<typeof makeStep>;
}) => Promise<unknown>;

const runImport = applyCsvImportFn as unknown as ImportHandler;

type FailureHandler = (ctx: {
  event: { data: { event: { data: { importId: string } } } };
  error: Error;
}) => Promise<void>;

const runOnFailure = (
  applyCsvImportFn as unknown as { onFailure: FailureHandler }
).onFailure;

const makeStep = () => {
  const order: string[] = [];
  const results: unknown[] = [];
  return {
    order,
    results,
    run: vi.fn(async (name: string, work: () => Promise<unknown>) => {
      order.push(name);
      const result = await work();
      results.push(result);
      return result;
    }),
  };
};

const stagedRow = (overrides: Partial<StagedRow>): StagedRow => ({
  rowNumber: 2,
  role: null,
  manufacturer: "GE Healthcare",
  product: "LOGIQ e",
  version: "R7",
  serialNumber: null,
  ip: null,
  macAddress: null,
  hostname: null,
  networkSegment: null,
  status: null,
  facility: null,
  building: null,
  floor: null,
  room: null,
  raw: ["GE Healthcare", "LOGIQ e", "R7"],
  ...overrides,
});

const importPlan = {
  mapping: {},
  statusValues: {},
  nameDecisions: {
    manufacturers: { "ge healthcare": { kind: "existing", id: "mfr-ge" } },
    products: { "ge healthcare::logiq e": { kind: "existing", id: "prd-lq" } },
  },
};

const queuedImport = {
  id: "imp-1",
  integrationId: "int-csv",
  userId: "user-uploader",
  chunkCount: 2,
  status: CsvImportStatus.Queued,
};

let recordedFailures: Array<{ rowNumber: number; reason: string }> = [];
let finalCounts = {
  totalRows: 4,
  addedCount: 4,
  linkedCount: 0,
  failedCount: 0,
};

const chunks: StagedRow[][] = [
  [
    stagedRow({ rowNumber: 2, serialNumber: "S-1" }),
    stagedRow({ rowNumber: 3, serialNumber: "S-2" }),
  ],
  [
    stagedRow({ rowNumber: 4, serialNumber: "S-3" }),
    stagedRow({ rowNumber: 5, serialNumber: "S-4" }),
  ],
];

const updateCalls = () =>
  mockPrisma.csvImport.update.mock.calls.map(([args]) => args.data);

beforeEach(() => {
  vi.clearAllMocks();
  recordedFailures = [];
  finalCounts = { totalRows: 4, addedCount: 4, linkedCount: 0, failedCount: 0 };
  mockPrisma.csvImport.findUnique.mockResolvedValue(queuedImport);
  mockPrisma.csvImport.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.csvImport.findUniqueOrThrow.mockImplementation(
    async (args: { select: Record<string, boolean> }) =>
      args.select.plan
        ? { plan: importPlan, failures: recordedFailures }
        : finalCounts,
  );
  mockGetChunk.mockImplementation(
    async (_importId: string, chunkIndex: number) => chunks[chunkIndex],
  );
  mockLoadMatchContext.mockResolvedValue({ assets: new Map() });
  mockLoadCanonicalNames.mockResolvedValue({
    manufacturers: new Map(),
    products: new Map(),
  });
  mockApplyChunk.mockResolvedValue({ added: 2, linked: 0, failures: [] });
  mockNameBelongsToAnother.mockResolvedValue(false);
});

const runWith = (step = makeStep()) =>
  runImport({ event: { data: { importId: "imp-1" } }, step });

describe("applyCsvImportFn — steps", () => {
  it("runs one apply step per staged chunk, between the file check and the finish", async () => {
    const step = makeStep();

    await runWith(step);

    expect(step.order).toEqual([
      "load-import",
      "mark-running",
      "save-aliases",
      "check-file",
      "apply-chunk-0",
      "apply-chunk-1",
      "finish",
      "delete-staged-rows",
    ]);
    expect(mockPrisma.csvImport.updateMany).toHaveBeenCalledWith({
      where: { id: "imp-1", status: CsvImportStatus.Queued },
      data: { status: CsvImportStatus.Running },
    });
  });

  it("stops when another run already started the import", async () => {
    mockPrisma.csvImport.updateMany.mockResolvedValue({ count: 0 });
    const step = makeStep();

    const result = await runWith(step);

    expect(result).toEqual({
      skipped: true,
      reason: "Another run already started this import",
    });
    expect(step.order).toEqual(["load-import", "mark-running"]);
    expect(mockApplyChunk).not.toHaveBeenCalled();
  });

  it("matches each chunk without the devices this import added, and applies it under the import's id", async () => {
    await runWith();

    expect(mockLoadMatchContext).toHaveBeenCalledWith(chunks[0], {
      excludeAssetsAddedByImportId: "imp-1",
    });
    expect(mockApplyChunk).toHaveBeenCalledWith(
      expect.objectContaining({ importId: "imp-1", rows: chunks[1] }),
    );
  });

  it("never returns rows from a step", async () => {
    const step = makeStep();

    await runWith(step);

    const everyStepResult = JSON.stringify(step.results);
    expect(everyStepResult).not.toContain("LOGIQ e");
    expect(everyStepResult).not.toContain("raw");
  });

  it("skips an import that is no longer queued", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue({
      ...queuedImport,
      status: CsvImportStatus.Running,
    });
    const step = makeStep();

    const result = await runWith(step);

    expect(result).toEqual({ skipped: true, reason: "Import is Running" });
    expect(step.order).toEqual(["load-import"]);
  });

  it("does not retry an import that was deleted", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(null);

    await expect(runWith()).rejects.toThrow(/not found/);
  });
});

describe("applyCsvImportFn — aliases", () => {
  it("saves the file's spelling for a name matched to an existing one", async () => {
    await runWith();

    expect(mockAddManufacturerAlias).toHaveBeenCalledWith(
      "mfr-ge",
      "GE Healthcare",
    );
    expect(mockAddProductAlias).toHaveBeenCalledWith("prd-lq", "LOGIQ e");
  });

  it("skips a spelling that already names another product", async () => {
    mockNameBelongsToAnother.mockImplementation(
      async (kind: string) => kind === "product",
    );

    await runWith();

    expect(mockNameBelongsToAnother).toHaveBeenCalledWith(
      "product",
      "LOGIQ e",
      "prd-lq",
    );
    expect(mockAddProductAlias).not.toHaveBeenCalled();
    expect(mockAddManufacturerAlias).toHaveBeenCalledOnce();
  });
});

describe("applyCsvImportFn — failures", () => {
  it("records rows the whole file rules out before applying any chunk", async () => {
    const chunksSharingASerial = [
      [stagedRow({ rowNumber: 2, serialNumber: "S-1" })],
      [stagedRow({ rowNumber: 4, serialNumber: "S-1" })],
    ];
    mockGetChunk.mockImplementation(
      async (_importId: string, chunkIndex: number) =>
        chunksSharingASerial[chunkIndex],
    );

    await runWith();

    expect(updateCalls()[0]).toEqual({
      failures: [
        { rowNumber: 4, reason: "Serial also used by row 2 in this file" },
      ],
      failedCount: 1,
    });
  });

  it("passes recorded failures to each chunk and adds only new ones", async () => {
    recordedFailures = [{ rowNumber: 3, reason: "Model is missing" }];
    mockApplyChunk.mockResolvedValueOnce({
      added: 1,
      linked: 0,
      failures: [
        { rowNumber: 3, reason: "Model is missing" },
        { rowNumber: 2, reason: "Internal Server Error" },
      ],
    });

    await runWith();

    expect(updateCalls()[1]).toEqual({
      addedCount: { increment: 1 },
      linkedCount: { increment: 0 },
      failedCount: { increment: 1 },
      failures: [
        { rowNumber: 3, reason: "Model is missing" },
        { rowNumber: 2, reason: "Internal Server Error" },
      ],
    });
  });
});

describe("applyCsvImportFn — finishing", () => {
  it.each([
    {
      counts: { totalRows: 4, addedCount: 3, linkedCount: 1, failedCount: 0 },
      status: CsvImportStatus.Succeeded,
    },
    {
      counts: { totalRows: 8, addedCount: 5, linkedCount: 1, failedCount: 2 },
      status: CsvImportStatus.PartiallyFailed,
    },
    {
      counts: { totalRows: 3, addedCount: 0, linkedCount: 0, failedCount: 3 },
      status: CsvImportStatus.Failed,
    },
  ])("finishes $status for $counts", async ({ counts, status }) => {
    finalCounts = counts;

    await runWith();

    expect(updateCalls().at(-1)).toEqual({
      status,
      finishedAt: expect.any(Date),
      errorMessage: null,
    });
  });

  it("marks the source Success when every row applied", async () => {
    await runWith();

    expect(mockUpsertResourceSync).toHaveBeenCalledWith(
      "int-csv",
      ResourceType.Asset,
      expect.objectContaining({
        message: "success",
        createdItemsCount: 4,
        shouldRetry: false,
      }),
      expect.any(Date),
    );
  });

  it("marks the source Error with a count when some rows failed", async () => {
    finalCounts = {
      totalRows: 8,
      addedCount: 5,
      linkedCount: 1,
      failedCount: 2,
    };

    await runWith();

    expect(mockUpsertResourceSync).toHaveBeenCalledWith(
      "int-csv",
      ResourceType.Asset,
      expect.objectContaining({
        message: "2 of 8 rows failed",
        shouldRetry: true,
      }),
      expect.any(Date),
    );
  });

  it("stops at a step that throws and finishes Failed with its message", async () => {
    mockApplyChunk.mockRejectedValueOnce(new Error("S3 timed out"));
    const step = makeStep();

    await runWith(step);

    expect(step.order.slice(-2)).toEqual(["apply-chunk-0", "finish"]);
    expect(updateCalls().at(-1)).toEqual({
      status: CsvImportStatus.Failed,
      finishedAt: expect.any(Date),
      errorMessage: "S3 timed out",
    });
    expect(mockUpsertResourceSync).toHaveBeenCalledWith(
      "int-csv",
      ResourceType.Asset,
      expect.objectContaining({ message: "S3 timed out", shouldRetry: true }),
      expect.any(Date),
    );
  });

  it("deletes the staged rows once every row applied", async () => {
    await runWith();

    expect(mockDeleteChunks).toHaveBeenCalledWith("imp-1", 2);
  });

  it("keeps the staged rows when some rows failed, for the failed-rows download", async () => {
    finalCounts = {
      totalRows: 8,
      addedCount: 5,
      linkedCount: 1,
      failedCount: 2,
    };
    const step = makeStep();

    await runWith(step);

    expect(mockDeleteChunks).not.toHaveBeenCalled();
    expect(step.order.at(-1)).toBe("finish");
  });

  it("still reports the import as Succeeded when the staged rows cannot be deleted", async () => {
    mockDeleteChunks.mockRejectedValue(new Error("S3 timed out"));

    const result = await runWith();

    expect(result).toEqual(
      expect.objectContaining({ status: CsvImportStatus.Succeeded }),
    );
  });

  it("finishes Failed when Inngest gives up on the run", async () => {
    await runOnFailure({
      event: { data: { event: { data: { importId: "imp-1" } } } },
      error: new Error("Function timed out"),
    });

    expect(updateCalls().at(-1)).toEqual({
      status: CsvImportStatus.Failed,
      finishedAt: expect.any(Date),
      errorMessage: "Function timed out",
    });
    expect(mockUpsertResourceSync).toHaveBeenCalledWith(
      "int-csv",
      ResourceType.Asset,
      expect.objectContaining({
        message: "Function timed out",
        shouldRetry: true,
      }),
      expect.any(Date),
    );
  });
});
