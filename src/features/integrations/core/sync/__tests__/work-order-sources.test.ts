// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    externalWorkOrderMapping: { findMany: vi.fn() },
    externalSourceRecordMapping: {
      findMany: vi.fn(),
      createManyAndReturn: vi.fn(),
      updateMany: vi.fn(),
    },
    sourceRecord: { findMany: vi.fn(), createManyAndReturn: vi.fn() },
    sourceLink: { createMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { SourceChannel } from "@/generated/prisma";
import { sourceContentHash } from "@/lib/source-hash";
import {
  recordWorkOrderSources,
  type WorkOrderSourceItem,
} from "../work-order-sources";

const item: WorkOrderSourceItem = {
  externalId: "sys-1",
  raw: { number: "CHG0000001", state: "-5" },
  body: "**CHG0000001**: Rollback Oracle Version",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([
    { externalId: "sys-1", itemId: "ticket-1" },
  ]);
  mockPrisma.externalSourceRecordMapping.findMany.mockResolvedValue([]);
  mockPrisma.externalSourceRecordMapping.createManyAndReturn.mockResolvedValue([
    { id: "srm-1", externalId: "sys-1" },
  ]);
  mockPrisma.sourceRecord.findMany.mockResolvedValue([]);
  mockPrisma.sourceRecord.createManyAndReturn.mockResolvedValue([
    { id: "sr-1", mappingId: "srm-1" },
  ]);
});

describe("recordWorkOrderSources", () => {
  it("snapshots a new record and links it to its ticket", async () => {
    await recordWorkOrderSources([item], "int-1");

    expect(
      mockPrisma.externalSourceRecordMapping.createManyAndReturn,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            integrationId: "int-1",
            externalId: "sys-1",
          }),
        ],
      }),
    );
    expect(mockPrisma.sourceRecord.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          {
            channel: SourceChannel.Integration,
            mappingId: "srm-1",
            contentHash: sourceContentHash(item.raw, item.body),
            raw: item.raw,
            markdown: item.body,
          },
        ],
      }),
    );
    expect(mockPrisma.sourceLink.createMany).toHaveBeenCalledWith({
      data: [{ sourceRecordId: "sr-1", workOrderTicketId: "ticket-1" }],
      skipDuplicates: true,
    });
  });

  it("writes no snapshot when the record has not changed", async () => {
    mockPrisma.externalSourceRecordMapping.findMany.mockResolvedValue([
      { id: "srm-1", externalId: "sys-1" },
    ]);
    mockPrisma.sourceRecord.findMany.mockResolvedValue([
      {
        mappingId: "srm-1",
        contentHash: sourceContentHash(item.raw, item.body),
      },
    ]);

    await recordWorkOrderSources([item], "int-1");

    expect(
      mockPrisma.externalSourceRecordMapping.updateMany,
    ).toHaveBeenCalled();
    expect(mockPrisma.sourceRecord.createManyAndReturn).not.toHaveBeenCalled();
    expect(mockPrisma.sourceLink.createMany).not.toHaveBeenCalled();
  });

  it("snapshots only the last item of a repeated externalId", async () => {
    const newer = { ...item, body: "**CHG0000001**: Closed" };

    await recordWorkOrderSources([item, newer], "int-1");

    expect(mockPrisma.sourceRecord.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ markdown: newer.body })],
      }),
    );
  });

  it("skips a record that has no ticket", async () => {
    mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([]);

    await recordWorkOrderSources([item], "int-1");

    expect(
      mockPrisma.externalSourceRecordMapping.findMany,
    ).not.toHaveBeenCalled();
    expect(mockPrisma.sourceRecord.createManyAndReturn).not.toHaveBeenCalled();
  });
});
