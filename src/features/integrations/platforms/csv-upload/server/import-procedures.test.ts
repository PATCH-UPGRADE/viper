// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockLoadMatchContext } = vi.hoisted(() => ({
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
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("../import/context", () => ({
  loadMatchContext: mockLoadMatchContext,
}));

import { createCallerFactory, createTRPCRouter } from "@/trpc/init";
import type { MatchKeysRow } from "../contract";
import type { ContextAsset } from "../import/plan";
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
