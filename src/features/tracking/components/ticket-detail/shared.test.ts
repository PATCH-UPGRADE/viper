import { describe, expect, it } from "vitest";
import { TicketStatus } from "@/generated/prisma";
import {
  countAssetTicketsByStatus,
  type DetailAssetTicket,
  sortAssetTicketsByStatus,
} from "./shared";

const assetTicket = (status: TicketStatus, id: string) =>
  ({ ticket: { id, status }, asset: { id } }) as unknown as DetailAssetTicket;

describe("sortAssetTicketsByStatus", () => {
  it("orders To Do, then In Progress, then Requires Approval, then Done, regardless of input order", () => {
    const input = [
      assetTicket(TicketStatus.DONE, "1"),
      assetTicket(TicketStatus.IN_PROGRESS, "2"),
      assetTicket(TicketStatus.TO_DO, "3"),
      assetTicket(TicketStatus.REQUIRES_APPROVAL, "4"),
    ];
    expect(sortAssetTicketsByStatus(input).map((a) => a.ticket.id)).toEqual([
      "3",
      "2",
      "4",
      "1",
    ]);
  });

  it("keeps ties in their original relative order (stable sort)", () => {
    const input = [
      assetTicket(TicketStatus.DONE, "1"),
      assetTicket(TicketStatus.TO_DO, "2"),
      assetTicket(TicketStatus.DONE, "3"),
    ];
    expect(sortAssetTicketsByStatus(input).map((a) => a.ticket.id)).toEqual([
      "2",
      "1",
      "3",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [
      assetTicket(TicketStatus.DONE, "1"),
      assetTicket(TicketStatus.TO_DO, "2"),
    ];
    const copy = [...input];
    sortAssetTicketsByStatus(input);
    expect(input).toEqual(copy);
  });
});

describe("countAssetTicketsByStatus", () => {
  it("counts per status, in canonical order, omitting zero-count statuses", () => {
    const input = [
      assetTicket(TicketStatus.DONE, "1"),
      assetTicket(TicketStatus.TO_DO, "2"),
      assetTicket(TicketStatus.TO_DO, "3"),
    ];
    expect(countAssetTicketsByStatus(input)).toEqual([
      { status: TicketStatus.TO_DO, count: 2 },
      { status: TicketStatus.DONE, count: 1 },
    ]);
  });

  it("returns an empty array for an empty input", () => {
    expect(countAssetTicketsByStatus([])).toEqual([]);
  });
});
