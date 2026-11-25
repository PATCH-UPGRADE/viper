// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockProcessIntegrationSync, mockDelete } = vi.hoisted(
  () => ({
    mockPrisma: {
      $transaction: vi.fn(),
      externalWorkOrderMapping: { findMany: vi.fn() },
      workOrderTicket: { findMany: vi.fn(), delete: vi.fn() },
    },
    mockProcessIntegrationSync: vi.fn(),
    mockDelete: vi.fn(),
  }),
);

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/lib/provenance/write", () => ({
  deleteWithObservation: mockDelete,
}));
vi.mock("../upsert", () => ({
  processIntegrationSync: mockProcessIntegrationSync,
  integrationOrigin: async (run: object) => ({ source: "INTEGRATION", ...run }),
}));

import { TRPCError } from "@trpc/server";
import { ResourceType, TicketStatus } from "@/generated/prisma";
import {
  deletePulledWorkOrders,
  ingestPulledWorkOrders,
  listMappedWorkOrders,
  type PulledWorkOrder,
} from "../work-order-sources";

const run = {
  integrationId: "int-1",
  observedAt: new Date("2026-11-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([
    { externalId: "sys-1", itemId: "ticket-1" },
  ]);
});

describe("ingestPulledWorkOrders", () => {
  const pulled: PulledWorkOrder = {
    externalId: "sys-1",
    raw: { number: "CHG0000001", state: "-5" },
    summary: "CHG0000001: Rollback Oracle Version",
    body: "**CHG0000001**: Rollback Oracle Version",
    status: TicketStatus.TO_DO,
    scheduledAt: "2026-04-16T23:00:00Z",
    scheduledEndTime: null,
  };
  const options = { ...run, sourceLabel: "ServiceNow" };

  it("maps each item onto the ticket fields with the source label", async () => {
    await ingestPulledWorkOrders([pulled], options);

    const [config, input, passedRun, resource] =
      mockProcessIntegrationSync.mock.calls[0];
    expect(input).toEqual({ items: [pulled] });
    expect(passedRun).toEqual(run);
    expect(resource).toBe(ResourceType.WorkOrder);

    const fields = {
      summary: pulled.summary,
      body: pulled.body,
      status: TicketStatus.TO_DO,
      scheduledAt: new Date("2026-04-16T23:00:00Z"),
      scheduledEndTime: null,
      sourceLabel: "ServiceNow",
    };
    expect(await config.transformInputItem(pulled)).toEqual({
      create: { fields },
      update: { fields },
      raw: pulled.raw,
      uniqueFieldConditions: [],
    });
  });

  it("ingests only the last item of a repeated externalId", async () => {
    const newer = { ...pulled, status: TicketStatus.DONE };

    await ingestPulledWorkOrders([pulled, newer], options);

    expect(mockProcessIntegrationSync.mock.calls[0][1]).toEqual({
      items: [newer],
    });
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
  const deletedIds = () =>
    mockPrisma.workOrderTicket.delete.mock.calls.map(([arg]) => arg.where.id);

  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([]);
    mockDelete.mockImplementation((tx, _params, remove) => remove(tx));
  });

  it("writes a TOMBSTONE for the ticket and each asset sub-ticket", async () => {
    mockPrisma.workOrderTicket.findMany.mockResolvedValue([{ id: "sub-1" }]);

    await deletePulledWorkOrders(run, ["sys-1"]);

    expect(mockPrisma.workOrderTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ticket: { parentTicketId: "ticket-1" } },
      }),
    );
    expect(mockDelete.mock.calls.map(([, params]) => params)).toEqual(
      ["ticket-1", "sub-1"].map((entityId) => ({
        entityType: "WORK_ORDER",
        entityId,
        origin: { source: "INTEGRATION", ...run },
      })),
    );
    expect(deletedIds()).toEqual(["sub-1", "ticket-1"]);
  });

  it("goes on after a ticket that is already gone", async () => {
    mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([
      { itemId: "gone" },
      { itemId: "ticket-1" },
    ]);
    mockDelete.mockRejectedValueOnce(new TRPCError({ code: "NOT_FOUND" }));

    await deletePulledWorkOrders(run, ["sys-0", "sys-1"]);

    expect(deletedIds()).toEqual(["ticket-1"]);
  });
});
