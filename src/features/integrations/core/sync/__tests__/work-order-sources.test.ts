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
    workOrderTicket: { deleteMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

const { mockProcessIntegrationSync } = vi.hoisted(() => ({
  mockProcessIntegrationSync: vi.fn(),
}));

vi.mock("../upsert", () => ({
  processIntegrationSync: mockProcessIntegrationSync,
}));
vi.mock("@/features/tracking/server/activities", () => ({
  recordCreationActivity: vi.fn(),
}));

import {
  ResourceType,
  SourceChannel,
  TicketCategory,
  TicketStatus,
} from "@/generated/prisma";
import { sourceContentHash } from "@/lib/source-hash";
import {
  deletePulledWorkOrders,
  ingestPulledWorkOrders,
  listMappedWorkOrders,
  type PulledWorkOrder,
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

  describe("with an unchanged record", () => {
    const newestSnapshot = (links: { workOrderTicketId: string | null }[]) => {
      mockPrisma.externalSourceRecordMapping.findMany.mockResolvedValue([
        { id: "srm-1", externalId: "sys-1" },
      ]);
      mockPrisma.sourceRecord.findMany.mockResolvedValue([
        {
          id: "sr-old",
          mappingId: "srm-1",
          contentHash: sourceContentHash(item.raw, item.body),
          links,
        },
      ]);
    };

    it("writes nothing when the ticket has its link", async () => {
      newestSnapshot([{ workOrderTicketId: "ticket-1" }]);

      await recordWorkOrderSources([item], "int-1");

      expect(
        mockPrisma.externalSourceRecordMapping.updateMany,
      ).toHaveBeenCalled();
      expect(
        mockPrisma.sourceRecord.createManyAndReturn,
      ).not.toHaveBeenCalled();
      expect(mockPrisma.sourceLink.createMany).not.toHaveBeenCalled();
    });

    it("links the newest snapshot to a ticket with no link", async () => {
      newestSnapshot([{ workOrderTicketId: "ticket-deleted" }]);

      await recordWorkOrderSources([item], "int-1");

      expect(
        mockPrisma.sourceRecord.createManyAndReturn,
      ).not.toHaveBeenCalled();
      expect(mockPrisma.sourceLink.createMany).toHaveBeenCalledWith({
        data: [{ sourceRecordId: "sr-old", workOrderTicketId: "ticket-1" }],
        skipDuplicates: true,
      });
    });
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

describe("ingestPulledWorkOrders", () => {
  const pulled: PulledWorkOrder = {
    ...item,
    summary: "CHG0000001: Rollback Oracle Version",
    status: TicketStatus.TO_DO,
    category: TicketCategory.OTHER,
    scheduledAt: "2026-04-16T23:00:00Z",
    scheduledEndTime: null,
  };
  const options = {
    integrationId: "int-1",
    integrationUserId: "user-1",
    sourceLabel: "ServiceNow",
  };
  const response = {
    message: "success",
    createdItemsCount: 1,
    updatedItemsCount: 0,
    shouldRetry: false,
  };

  beforeEach(() => {
    mockProcessIntegrationSync.mockResolvedValue(response);
  });

  it("maps each item onto the ticket fields with the source label", async () => {
    await ingestPulledWorkOrders([pulled], options);

    const [, config, input, userId, integrationId, resource] =
      mockProcessIntegrationSync.mock.calls[0];
    expect(input).toEqual({ items: [pulled] });
    expect([userId, integrationId, resource]).toEqual([
      "user-1",
      "int-1",
      ResourceType.WorkOrder,
    ]);

    const fields = {
      summary: pulled.summary,
      body: pulled.body,
      status: TicketStatus.TO_DO,
      category: TicketCategory.OTHER,
      scheduledAt: new Date("2026-04-16T23:00:00Z"),
      scheduledEndTime: null,
      sourceLabel: "ServiceNow",
    };
    await expect(
      config.transformInputItem(pulled, "user-1"),
    ).resolves.toMatchObject({
      createData: { ...fields, creatorId: "user-1" },
      updateData: fields,
    });
  });

  it("keeps the ticket's category when the platform sends none", async () => {
    const { category: _, ...withoutCategory } = pulled;
    await ingestPulledWorkOrders([withoutCategory], options);

    const [, config] = mockProcessIntegrationSync.mock.calls[0];
    const { createData, updateData } = await config.transformInputItem(
      withoutCategory,
      "user-1",
    );
    expect(createData.category).toBe(TicketCategory.OTHER);
    expect(updateData).not.toHaveProperty("category");
  });

  it("ingests only the last item of a repeated externalId", async () => {
    const newer = { ...pulled, status: TicketStatus.DONE };

    await ingestPulledWorkOrders([pulled, newer], options);

    expect(mockProcessIntegrationSync.mock.calls[0][2]).toEqual({
      items: [newer],
    });
  });

  it("records the snapshots after the ingest and returns its response", async () => {
    const result = await ingestPulledWorkOrders([pulled], options);

    expect(result).toBe(response);
    expect(mockPrisma.sourceRecord.createManyAndReturn).toHaveBeenCalled();
    expect(mockProcessIntegrationSync.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.externalWorkOrderMapping.findMany.mock.invocationCallOrder[0],
    );
  });
});

describe("listMappedWorkOrders", () => {
  it("returns only the ids with a mapping on this integration", async () => {
    await expect(
      listMappedWorkOrders("int-1", ["sys-1", "sys-2"]),
    ).resolves.toEqual(["sys-1"]);
    expect(mockPrisma.externalWorkOrderMapping.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integrationId: "int-1",
          externalId: { in: ["sys-1", "sys-2"] },
        },
      }),
    );
  });

  it("does not query for an empty list", async () => {
    await expect(listMappedWorkOrders("int-1", [])).resolves.toEqual([]);
    expect(mockPrisma.externalWorkOrderMapping.findMany).not.toHaveBeenCalled();
  });
});

describe("deletePulledWorkOrders", () => {
  it("deletes the ticket and its asset sub-tickets", async () => {
    await deletePulledWorkOrders("int-1", ["sys-1"]);

    expect(mockPrisma.workOrderTicket.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: { in: ["ticket-1"] } },
          { ticket: { parentTicketId: { in: ["ticket-1"] } } },
        ],
      },
    });
  });

  it("does nothing for an empty list", async () => {
    await deletePulledWorkOrders("int-1", []);

    expect(mockPrisma.workOrderTicket.deleteMany).not.toHaveBeenCalled();
  });
});
