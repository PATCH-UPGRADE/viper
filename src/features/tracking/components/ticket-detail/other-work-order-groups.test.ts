import { describe, expect, it } from "vitest";
import { TicketStatus } from "@/generated/prisma";
import type { OtherAssetWorkOrder } from "../../types";
import {
  assetLabelsById,
  countOtherWorkOrdersByAsset,
  groupByAsset,
  groupByTeam,
  NO_TEAM_LABEL,
} from "./other-work-order-groups";
import type { DetailAssetTicket } from "./shared";

const assetTicket = (
  id: string,
  hostname: string | null = null,
  location: unknown = null,
) =>
  ({
    ticket: { id: `child-${id}`, status: TicketStatus.TO_DO },
    asset: { id, hostname, location },
  }) as unknown as DetailAssetTicket;

const workOrder = (
  id: string,
  assetIds: string[],
  departments: { id: string; name: string }[] = [],
): OtherAssetWorkOrder => ({
  id,
  summary: `Work order ${id}`,
  status: TicketStatus.TO_DO,
  scheduledAt: null,
  departments,
  assetTickets: assetIds.map((assetId) => ({
    assetId,
    ticketId: `${id}-${assetId}`,
    status: TicketStatus.TO_DO,
  })),
});

const BIOMED = { id: "d-biomed", name: "Biomed Engineering" };
const FACILITIES = { id: "d-fac", name: "Facilities" };

describe("groupByAsset", () => {
  it("keeps the given asset order", () => {
    const groups = groupByAsset(
      [assetTicket("a-2"), assetTicket("a-1")],
      [workOrder("w1", ["a-1", "a-2"])],
    );
    expect(groups.map((g) => g.key)).toEqual(["a-2", "a-1"]);
  });

  it("leaves out an asset with no other work orders", () => {
    const groups = groupByAsset(
      [assetTicket("a-1"), assetTicket("a-2")],
      [workOrder("w1", ["a-1"])],
    );
    expect(groups.map((g) => g.key)).toEqual(["a-1"]);
  });

  it("returns no groups when nothing overlaps", () => {
    const groups = groupByAsset([assetTicket("a-1"), assetTicket("a-2")], []);
    expect(groups).toEqual([]);
  });

  it("places a work order touching two assets in both groups", () => {
    const groups = groupByAsset(
      [assetTicket("a-1"), assetTicket("a-2")],
      [workOrder("w1", ["a-1", "a-2"])],
    );
    expect(groups.map((g) => g.workOrders.map((w) => w.id))).toEqual([
      ["w1"],
      ["w1"],
    ]);
  });

  it("labels a group by hostname, falling back to the asset id", () => {
    const groups = groupByAsset(
      [assetTicket("a-1", "AST-DIA-01"), assetTicket("a-2")],
      [workOrder("w1", ["a-1", "a-2"])],
    );
    expect(groups.map((g) => g.label)).toEqual(["AST-DIA-01", "a-2"]);
  });

  it("sets subLabel from the location, and omits it when there is none", () => {
    const groups = groupByAsset(
      [
        assetTicket("a-1", null, { building: "Dialysis Unit", room: "3" }),
        assetTicket("a-2"),
      ],
      [workOrder("w1", ["a-1", "a-2"])],
    );
    expect(groups[0]?.subLabel).toBe("Dialysis Unit · 3");
    expect(groups[1]?.subLabel).toBeUndefined();
  });
});

describe("groupByTeam", () => {
  it("repeats a work order under each of its departments", () => {
    const groups = groupByTeam([
      workOrder("w1", ["a-1"], [BIOMED, FACILITIES]),
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Biomed Engineering",
      "Facilities",
    ]);
    expect(groups.every((g) => g.workOrders[0]?.id === "w1")).toBe(true);
  });

  it("orders departments alphabetically", () => {
    const groups = groupByTeam([
      workOrder("w1", ["a-1"], [FACILITIES]),
      workOrder("w2", ["a-1"], [BIOMED]),
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Biomed Engineering",
      "Facilities",
    ]);
  });

  it("puts work orders with no department in a trailing No team group", () => {
    const groups = groupByTeam([
      workOrder("w1", ["a-1"]),
      workOrder("w2", ["a-1"], [FACILITIES]),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["d-fac", NO_TEAM_LABEL]);
    expect(groups[1]?.workOrders.map((w) => w.id)).toEqual(["w1"]);
  });

  it("omits the No team group when every work order has a department", () => {
    const groups = groupByTeam([workOrder("w1", ["a-1"], [BIOMED])]);
    expect(groups.map((g) => g.key)).toEqual(["d-biomed"]);
  });
});

describe("countOtherWorkOrdersByAsset", () => {
  it("counts a work order once for each asset it touches", () => {
    expect(
      countOtherWorkOrdersByAsset([
        workOrder("w1", ["a-1", "a-2"]),
        workOrder("w2", ["a-1"]),
      ]),
    ).toEqual({ "a-1": 2, "a-2": 1 });
  });

  it("leaves out an asset with no other work orders", () => {
    expect(
      countOtherWorkOrdersByAsset([workOrder("w1", ["a-1"])]),
    ).not.toHaveProperty("a-2");
  });
});

describe("assetLabelsById", () => {
  it("maps each asset id to its hostname, falling back to the id", () => {
    expect(
      assetLabelsById([assetTicket("a-1", "AST-DIA-01"), assetTicket("a-2")]),
    ).toEqual({ "a-1": "AST-DIA-01", "a-2": "a-2" });
  });
});
