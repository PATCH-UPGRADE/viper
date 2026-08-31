// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    externalWorkOrderMapping: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { TicketCategory, TicketStatus } from "@/generated/prisma";
import type { FleetWorkOrderItem } from "../activities";
import { reconcileProvisionalMappings } from "../sync";

const item = (
  vendorId: string,
  ownIncidentNumber: string | null,
  equipmentKey: string | null = "US_1064669350",
): FleetWorkOrderItem => ({
  vendorId,
  equipmentKey,
  summary: "Firmware update",
  status: TicketStatus.TO_DO,
  category: TicketCategory.FIRMWARE_UPDATE,
  scheduledAt: null,
  body: "",
  ownIncidentNumber,
  raw: { ticketKey: vendorId },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconcileProvisionalMappings", () => {
  it("swaps a provisional id for the real ticket key Fleet echoed back", async () => {
    mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([
      { id: "m1", externalId: "pending:call_abc:US_1064669350" },
    ]);

    await reconcileProvisionalMappings(
      [item("US_400501937577", "call_abc")],
      "int-fleet",
    );

    // Without this the ingest finds no mapping for the real key and files a
    // second ticket for an order that already exists.
    expect(mockPrisma.externalWorkOrderMapping.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { externalId: "US_400501937577" },
    });
  });

  it("leaves a provisional mapping alone when no activity claims it", async () => {
    // A provisional row is returned, but it belongs to a reference no activity
    // in this poll carries, so the loop must reach its guard and skip it.
    mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([
      { id: "m1", externalId: "pending:call_abc:US_1064669350" },
    ]);

    await reconcileProvisionalMappings(
      [item("US_400501937577", "call_other")],
      "int-fleet",
    );

    expect(mockPrisma.externalWorkOrderMapping.update).not.toHaveBeenCalled();
  });

  it("does not query when no activity carries our reference", async () => {
    await reconcileProvisionalMappings(
      [item("US_400501937577", null)],
      "int-fleet",
    );

    expect(mockPrisma.externalWorkOrderMapping.findMany).not.toHaveBeenCalled();
  });

  it("keeps one proposal's per-equipment orders apart", async () => {
    // One proposal covering two assets sends the same reference on both orders,
    // so only the equipment key tells the two provisional mappings apart.
    mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([
      { id: "m1", externalId: "pending:call_abc:EQ_1" },
      { id: "m2", externalId: "pending:call_abc:EQ_2" },
    ]);

    await reconcileProvisionalMappings(
      [item("US_1", "call_abc", "EQ_1"), item("US_2", "call_abc", "EQ_2")],
      "int-fleet",
    );

    expect(mockPrisma.externalWorkOrderMapping.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { externalId: "US_1" },
    });
    expect(mockPrisma.externalWorkOrderMapping.update).toHaveBeenCalledWith({
      where: { id: "m2" },
      data: { externalId: "US_2" },
    });
  });

  it("never claims a key another mapping already holds", async () => {
    // `(integrationId, externalId)` is unique: writing the duplicate would
    // throw and fail the whole sync.
    mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([
      { id: "m1", externalId: "pending:call_abc:EQ_1" },
      { id: "m2", externalId: "US_1" },
    ]);

    await reconcileProvisionalMappings(
      [item("US_1", "call_abc", "EQ_1")],
      "int-fleet",
    );

    expect(mockPrisma.externalWorkOrderMapping.update).not.toHaveBeenCalled();
  });
});
