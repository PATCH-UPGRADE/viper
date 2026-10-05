// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockLoadMatchContext,
  mockCreateIntegration,
  mockInngest,
  mockPutChunk,
  mockFindStagedRows,
} = vi.hoisted(() => ({
  mockPrisma: {
    csvImport: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    integrationResourceSync: { update: vi.fn() },
    $transaction: vi.fn(),
  },
  mockLoadMatchContext: vi.fn(),
  mockCreateIntegration: vi.fn(),
  mockInngest: { send: vi.fn() },
  mockPutChunk: vi.fn(),
  mockFindStagedRows: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("../import/context", () => ({
  loadMatchContext: mockLoadMatchContext,
}));
vi.mock("@/features/integrations/server/create-integration", () => ({
  createIntegration: mockCreateIntegration,
}));
vi.mock("@/inngest/client", () => ({ inngest: mockInngest }));
vi.mock("../import/staging", () => ({
  putChunk: mockPutChunk,
  findStagedRows: mockFindStagedRows,
}));

import {
  CsvImportStatus,
  PlatformEnum,
  SyncStatusEnum,
} from "@/generated/prisma";
import { createCallerFactory, createTRPCRouter } from "@/trpc/init";
import type { MatchKeysRow, StagedRow } from "../contract";
import type { ContextAsset } from "../import/match-rows";
import { importProcedures } from "./import-procedures";

const caller = createCallerFactory(createTRPCRouter(importProcedures))({
  req: undefined,
  auth: { user: { id: "user-uploader" } },
});

const keysRow = (overrides: Partial<MatchKeysRow>): MatchKeysRow => ({
  rowNumber: 2,
  manufacturer: "GE Healthcare",
  product: "CARESCAPE B650",
  serialNumber: null,
  macAddress: null,
  hostname: null,
  ...overrides,
});

const monitor: ContextAsset = {
  id: "mon-1",
  label: "GE HealthCare CARESCAPE B650 · Patient monitor",
  platforms: ["Partner API"],
  serialNumber: "GE-CB-2021-118",
  macAddress: null,
  hostname: null,
  ip: null,
  networkSegment: null,
  role: "Patient monitor",
  status: null,
  location: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((work: (tx: unknown) => unknown) =>
    work(mockPrisma),
  );
});

describe("csvImport.preview", () => {
  it("plans every row and lists each linked device once", async () => {
    mockLoadMatchContext.mockResolvedValue({
      assets: new Map([[monitor.id, monitor]]),
    });
    const rows = [
      keysRow({ rowNumber: 2, serialNumber: "GE-CB-2021-118" }),
      keysRow({ rowNumber: 3, serialNumber: "NEW-0001" }),
      keysRow({ rowNumber: 4, product: null }),
    ];

    const preview = await caller.preview({ rows });

    expect(mockLoadMatchContext).toHaveBeenCalledWith(rows);
    expect(preview.outcomes).toEqual([
      { kind: "link", rowNumber: 2, assetId: "mon-1" },
      { kind: "add", rowNumber: 3 },
      { kind: "fail", rowNumber: 4, reason: "Model is missing" },
    ]);
    expect(preview.linkedAssets).toEqual([
      {
        id: "mon-1",
        label: "GE HealthCare CARESCAPE B650 · Patient monitor",
        serialNumber: "GE-CB-2021-118",
        platforms: ["Partner API"],
      },
    ]);
  });

  it("refuses a request larger than the request limit", async () => {
    const longCell = "x".repeat(256);
    const rows = Array.from({ length: 2000 }, (_, index) =>
      keysRow({
        rowNumber: index + 2,
        manufacturer: longCell,
        product: longCell,
        serialNumber: longCell,
        macAddress: longCell,
        hostname: longCell,
      }),
    );

    await expect(caller.preview({ rows })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mockLoadMatchContext).not.toHaveBeenCalled();
  });
});

const ownedImport = (overrides: Record<string, unknown> = {}) => ({
  id: "imp-1",
  userId: "user-uploader",
  integrationId: "int-csv",
  fileName: "biomed_export_2026-09.csv",
  chunkCount: 0,
  status: CsvImportStatus.Staging,
  totalRows: 1204,
  addedCount: 0,
  linkedCount: 0,
  failedCount: 0,
  finishedAt: null,
  integration: { name: "CSV Assets Upload - Oct 1, 2026" },
  ...overrides,
});

const stagedRow: StagedRow = {
  rowNumber: 2,
  role: "Infusion pump",
  manufacturer: "BD",
  product: "Alaris 8015",
  version: "12.1.2",
  serialNumber: "8015-61022",
  ip: null,
  macAddress: null,
  hostname: null,
  networkSegment: null,
  status: null,
  facility: null,
  building: "Main Tower",
  floor: null,
  room: "4W-12",
  raw: ["BD", "Alaris 8015", "8015-61022", "Main Tower", "4W-12"],
};

const importPlan = {
  mapping: { manufacturer: { kind: "column" as const, header: "Mfr" } },
  statusValues: {},
  nameDecisions: {
    manufacturers: { bd: { kind: "existing" as const, id: "mfr-bd" } },
    products: {},
  },
};

describe("csvImport.createImport", () => {
  beforeEach(() => {
    mockCreateIntegration.mockResolvedValue({
      id: "int-csv",
      name: "CSV Assets Upload - Oct 1, 2026",
    });
    mockPrisma.csvImport.create.mockResolvedValue({ id: "imp-1" });
  });

  it("creates a CSV Upload source under a dated default name and saves only the plan", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));

    const created = await caller.createImport({
      ...importPlan,
      fileName: "biomed_export_2026-09.csv",
      headers: ["Mfr", "Model", "Serial"],
      rowCount: 1204,
    });
    vi.useRealTimers();

    expect(mockCreateIntegration).toHaveBeenCalledWith(
      {
        name: "CSV Assets Upload - Oct 1, 2026",
        platform: PlatformEnum.CSV_UPLOAD,
        config: {},
      },
      "user-uploader",
    );
    expect(mockPrisma.csvImport.create).toHaveBeenCalledWith({
      data: {
        integrationId: "int-csv",
        userId: "user-uploader",
        fileName: "biomed_export_2026-09.csv",
        headers: ["Mfr", "Model", "Serial"],
        plan: importPlan,
        totalRows: 1204,
      },
      select: { id: true },
    });
    expect(created).toEqual({
      importId: "imp-1",
      integrationId: "int-csv",
      sourceName: "CSV Assets Upload - Oct 1, 2026",
    });
  });

  it("names the source what the user typed", async () => {
    await caller.createImport({
      ...importPlan,
      sourceName: "  Biomed inventory  ",
      fileName: "biomed.csv",
      headers: ["Mfr"],
      rowCount: 1,
    });

    expect(mockCreateIntegration.mock.calls[0][0].name).toBe(
      "Biomed inventory",
    );
  });
});

describe("csvImport.stageRows", () => {
  it("stores the next chunk and counts it", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(ownedImport());

    const staged = await caller.stageRows({
      importId: "imp-1",
      chunkIndex: 0,
      rows: [stagedRow],
    });

    expect(mockPutChunk).toHaveBeenCalledWith("imp-1", 0, [stagedRow]);
    expect(mockPrisma.csvImport.update).toHaveBeenCalledWith({
      where: { id: "imp-1" },
      data: { chunkCount: 1 },
    });
    expect(staged).toEqual({ stagedChunks: 1 });
  });

  it("accepts a re-sent chunk without counting it twice", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(
      ownedImport({ chunkCount: 1 }),
    );

    const staged = await caller.stageRows({
      importId: "imp-1",
      chunkIndex: 0,
      rows: [stagedRow],
    });

    expect(mockPutChunk).toHaveBeenCalledOnce();
    expect(mockPrisma.csvImport.update).not.toHaveBeenCalled();
    expect(staged).toEqual({ stagedChunks: 1 });
  });

  it("refuses a chunk that skips ahead", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(ownedImport());

    await expect(
      caller.stageRows({ importId: "imp-1", chunkIndex: 2, rows: [stagedRow] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockPutChunk).not.toHaveBeenCalled();
  });

  it("refuses rows for another user's import", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(
      ownedImport({ userId: "someone-else" }),
    );

    await expect(
      caller.stageRows({ importId: "imp-1", chunkIndex: 0, rows: [stagedRow] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockPutChunk).not.toHaveBeenCalled();
  });

  it("refuses rows once the import has started", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(
      ownedImport({ status: CsvImportStatus.Queued }),
    );

    await expect(
      caller.stageRows({ importId: "imp-1", chunkIndex: 0, rows: [stagedRow] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("csvImport.startImport", () => {
  it("queues the import, marks the source as importing, and asks the job to run", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(
      ownedImport({ chunkCount: 2 }),
    );
    mockPrisma.csvImport.update.mockResolvedValue(
      ownedImport({ chunkCount: 2, status: CsvImportStatus.Queued }),
    );

    const started = await caller.startImport({
      importId: "imp-1",
      chunkCount: 2,
    });

    expect(mockPrisma.integrationResourceSync.update).toHaveBeenCalledWith({
      where: {
        integrationId_resource: { integrationId: "int-csv", resource: "Asset" },
      },
      data: {
        status: SyncStatusEnum.Pending,
        errorMessage: null,
        lastAttemptAt: expect.any(Date),
      },
    });
    expect(mockPrisma.csvImport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "imp-1" },
        data: { status: CsvImportStatus.Queued },
      }),
    );
    expect(mockInngest.send).toHaveBeenCalledWith({
      name: "csv-import/apply.requested",
      data: { importId: "imp-1" },
    });
    expect(started.status).toBe(CsvImportStatus.Queued);
  });

  it("refuses to start before every chunk is staged", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(
      ownedImport({ chunkCount: 1 }),
    );

    await expect(
      caller.startImport({ importId: "imp-1", chunkCount: 2 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockInngest.send).not.toHaveBeenCalled();
  });

  it("refuses to start an import that is already running", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(
      ownedImport({ chunkCount: 2, status: CsvImportStatus.Running }),
    );

    await expect(
      caller.startImport({ importId: "imp-1", chunkCount: 2 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockInngest.send).not.toHaveBeenCalled();
  });
});

describe("csvImport.status", () => {
  it("reports progress under the source's name", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(
      ownedImport({
        status: CsvImportStatus.Running,
        addedCount: 600,
        linkedCount: 4,
        failedCount: 2,
      }),
    );

    const status = await caller.status({ importId: "imp-1" });

    expect(status).toEqual({
      importId: "imp-1",
      integrationId: "int-csv",
      sourceName: "CSV Assets Upload - Oct 1, 2026",
      fileName: "biomed_export_2026-09.csv",
      status: CsvImportStatus.Running,
      totalRows: 1204,
      addedCount: 600,
      linkedCount: 4,
      failedCount: 2,
      finishedAt: null,
    });
  });

  it("404s for an import that does not exist", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(null);

    await expect(caller.status({ importId: "missing" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("csvImport.failures", () => {
  const recorded = [
    { rowNumber: 1012, reason: "Manufacturer is missing" },
    { rowNumber: 214, reason: "Serial also used by row 88 in this file" },
    { rowNumber: 391, reason: "Model is missing" },
  ];

  beforeEach(() => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(
      ownedImport({ chunkCount: 3, status: CsvImportStatus.PartiallyFailed }),
    );
    mockPrisma.csvImport.findUniqueOrThrow.mockResolvedValue({
      failures: recorded,
      headers: ["Mfr", "Model", "Serial"],
    });
  });

  it("lists failures in file order, labelled from the staged row", async () => {
    mockFindStagedRows.mockResolvedValue(
      new Map([
        [
          214,
          {
            ...stagedRow,
            rowNumber: 214,
            manufacturer: "Philips",
            product: "IntelliVue MX800",
            serialNumber: "P-518204",
          },
        ],
        [
          1012,
          {
            ...stagedRow,
            rowNumber: 1012,
            manufacturer: null,
            product: "Centrella",
            serialNumber: "H-905521",
          },
        ],
      ]),
    );

    const page = await caller.failures({ importId: "imp-1", page: 1 });

    expect(mockFindStagedRows).toHaveBeenCalledWith(
      "imp-1",
      3,
      new Set([214, 391, 1012]),
    );
    expect(page).toEqual({
      items: [
        {
          rowNumber: 214,
          reason: "Serial also used by row 88 in this file",
          label: "Philips IntelliVue MX800 · P-518204",
        },
        { rowNumber: 391, reason: "Model is missing", label: "Row 391" },
        {
          rowNumber: 1012,
          reason: "Manufacturer is missing",
          label: "Centrella · H-905521",
        },
      ],
      total: 3,
    });
  });

  it("pages by the See list page size", async () => {
    mockPrisma.csvImport.findUniqueOrThrow.mockResolvedValue({
      failures: Array.from({ length: 30 }, (_, index) => ({
        rowNumber: index + 2,
        reason: "Model is missing",
      })),
      headers: ["Mfr"],
    });
    mockFindStagedRows.mockResolvedValue(new Map());

    const secondPage = await caller.failures({ importId: "imp-1", page: 2 });

    expect(secondPage.total).toBe(30);
    expect(secondPage.items.map((item) => item.rowNumber)).toEqual([
      27, 28, 29, 30, 31,
    ]);
  });

  it("refuses another user's import", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(
      ownedImport({ userId: "someone-else" }),
    );

    await expect(
      caller.failures({ importId: "imp-1", page: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("csvImport.failuresCsv", () => {
  it("rebuilds the failed rows under the original headers, with a Reason column", async () => {
    mockPrisma.csvImport.findUnique.mockResolvedValue(
      ownedImport({ chunkCount: 1, status: CsvImportStatus.PartiallyFailed }),
    );
    mockPrisma.csvImport.findUniqueOrThrow.mockResolvedValue({
      failures: [
        { rowNumber: 391, reason: "Model is missing" },
        { rowNumber: 214, reason: "Serial also used by row 88 in this file" },
      ],
      headers: ["Mfr", "Model", "Serial", "Location"],
    });
    mockFindStagedRows.mockResolvedValue(
      new Map([
        [
          214,
          {
            ...stagedRow,
            rowNumber: 214,
            raw: ["Philips", "IntelliVue MX800", "P-518204", "ICU, Bed 4"],
          },
        ],
        [
          391,
          { ...stagedRow, rowNumber: 391, raw: ["Mindray", "", "MD-771930"] },
        ],
      ]),
    );

    const download = await caller.failuresCsv({ importId: "imp-1" });

    expect(download.fileName).toBe(
      "CSV Assets Upload - Oct 1, 2026-failed-rows.csv",
    );
    expect(download.csv).toBe(
      [
        "Mfr,Model,Serial,Location,Reason",
        'Philips,IntelliVue MX800,P-518204,"ICU, Bed 4",Serial also used by row 88 in this file',
        "Mindray,,MD-771930,,Model is missing",
      ].join("\r\n"),
    );
  });
});
