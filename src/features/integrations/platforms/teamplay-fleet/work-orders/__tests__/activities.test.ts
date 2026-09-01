// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TicketCategory, TicketStatus } from "@/generated/prisma";
import type { Session } from "../../../../core/types";
import { type FleetActivity, listChanged, toCanonical } from "../activities";

// Representative records from a real Fleet /activities response.
const UPDATE_SERVICE: FleetActivity = {
  ticketKey: "US_400501937577",
  ticketNumber: "400501937577",
  equipmentKey: "US_1064669350",
  type: "3",
  scheduled: false,
  plannedStart: null,
  plannedEnd: null,
  dueDate: "2026-09-11T00:00:00",
  sapSystem: "P40",
  shortText: "Update Service",
  qmtext: "UI-MR049/24/P NX VA60A-SP02",
  activityTitle: "Update Service: UI-MR049/24/P NX VA60A-SP02",
  ownIncidentNumber: null,
};

const MAINTENANCE: FleetActivity = {
  ticketKey: "US_400301843659",
  ticketNumber: "400301843659",
  equipmentKey: "US_1012141299",
  type: "2",
  scheduled: true,
  plannedStart: "2026-07-22T13:02:00",
  plannedEnd: "2026-07-22T17:32:00",
  dueDate: "2026-03-22T00:00:00",
  sapSystem: "P40",
  shortText: "Maintenance",
  qmtext: "SAFETY RELATED TEST  9Y Annual",
  activityTitle: "Maintenance: SAFETY RELATED TEST  9Y Annual",
  ownIncidentNumber: "call_abc",
};

describe("toCanonical", () => {
  it("uses ticketKey as the dedup vendorId and activityTitle as the summary", () => {
    const item = toCanonical(UPDATE_SERVICE);
    expect(item.vendorId).toBe("US_400501937577");
    expect(item.summary).toBe("Update Service: UI-MR049/24/P NX VA60A-SP02");
  });

  it("carries the equipment key, which separates one proposal's orders", () => {
    expect(toCanonical(UPDATE_SERVICE).equipmentKey).toBe("US_1064669350");
    expect(
      toCanonical({ ...UPDATE_SERVICE, equipmentKey: null }).equipmentKey,
    ).toBeNull();
  });

  it("maps an unscheduled Update Service to TO_DO / FIRMWARE_UPDATE", () => {
    const item = toCanonical(UPDATE_SERVICE);
    expect(item.status).toBe(TicketStatus.TO_DO);
    expect(item.category).toBe(TicketCategory.FIRMWARE_UPDATE);
  });

  it("maps a scheduled Maintenance to IN_PROGRESS / MAINTENANCE", () => {
    const item = toCanonical(MAINTENANCE);
    expect(item.status).toBe(TicketStatus.IN_PROGRESS);
    expect(item.category).toBe(TicketCategory.MAINTENANCE);
  });

  it("falls back to OTHER for a type it does not know", () => {
    expect(
      toCanonical({ ...UPDATE_SERVICE, type: "9", shortText: "Inspection" })
        .category,
    ).toBe(TicketCategory.OTHER);
  });

  it("appends the Fleet offset to naive datetimes: plannedStart, else dueDate", () => {
    expect(toCanonical(UPDATE_SERVICE).scheduledAt).toBe(
      "2026-09-11T00:00:00-05:00",
    );
    expect(toCanonical(MAINTENANCE).scheduledAt).toBe(
      "2026-07-22T13:02:00-05:00",
    );
  });

  it("leaves an already-qualified datetime alone", () => {
    expect(
      toCanonical({ ...MAINTENANCE, plannedStart: "2026-07-22T13:02:00Z" })
        .scheduledAt,
    ).toBe("2026-07-22T13:02:00Z");
  });

  it("has no schedule when Fleet gives neither date", () => {
    expect(
      toCanonical({ ...UPDATE_SERVICE, dueDate: null }).scheduledAt,
    ).toBeNull();
  });

  it("keeps our reference so the sync can reconcile a provisional mapping", () => {
    expect(toCanonical(MAINTENANCE).ownIncidentNumber).toBe("call_abc");
    expect(toCanonical(UPDATE_SERVICE).ownIncidentNumber).toBeNull();
  });

  it("puts the ticket, equipment and description in the body", () => {
    const body = toCanonical(UPDATE_SERVICE).body;
    expect(body).toContain("400501937577");
    expect(body).toContain("US_1064669350");
    expect(body).toContain("UI-MR049/24/P NX VA60A-SP02");
  });
});

describe("mapCategory precedence", () => {
  const activity = (type: string | null, shortText: string): FleetActivity => ({
    ...UPDATE_SERVICE,
    type,
    shortText,
  });

  it("trusts Fleet's type code over the wording", () => {
    // Type 2 is maintenance, whatever the short text happens to say.
    expect(toCanonical(activity("2", "Update maintenance")).category).toBe(
      TicketCategory.MAINTENANCE,
    );
    expect(toCanonical(activity("3", "Scheduled maintenance")).category).toBe(
      TicketCategory.FIRMWARE_UPDATE,
    );
  });

  it("falls back to the wording only when the code is unknown", () => {
    expect(toCanonical(activity("9", "Update service")).category).toBe(
      TicketCategory.FIRMWARE_UPDATE,
    );
    expect(toCanonical(activity(null, "Annual maintenance")).category).toBe(
      TicketCategory.MAINTENANCE,
    );
    expect(toCanonical(activity(null, "Site visit")).category).toBe(
      TicketCategory.OTHER,
    );
  });
});

describe("mapStatus closure", () => {
  const withStatus = (
    activityStatus: string | null,
    scheduled: boolean,
  ): FleetActivity => ({ ...UPDATE_SERVICE, activityStatus, scheduled });

  it("closes a ticket on Fleet's closed activityStatus codes", () => {
    expect(toCanonical(withStatus("3", false)).status).toBe(TicketStatus.DONE);
    expect(toCanonical(withStatus("4", false)).status).toBe(TicketStatus.DONE);
    // Closed wins even when a window is still booked.
    expect(toCanonical(withStatus("4", true)).status).toBe(TicketStatus.DONE);
  });

  it("leaves an open activity on its scheduling state", () => {
    expect(toCanonical(withStatus("1", false)).status).toBe(TicketStatus.TO_DO);
    expect(toCanonical(withStatus("2", true)).status).toBe(
      TicketStatus.IN_PROGRESS,
    );
  });

  it("does not close a ticket that merely carries a completedDate", () => {
    // Recurring maintenance keeps a last-done date while still open.
    const open: FleetActivity = {
      ...UPDATE_SERVICE,
      activityStatus: "2",
      scheduled: true,
      completedDate: "2026-03-01T00:00:00",
    };
    expect(toCanonical(open).status).toBe(TicketStatus.IN_PROGRESS);
  });

  it("falls back to scheduling when Fleet sends no status", () => {
    expect(toCanonical(withStatus(null, true)).status).toBe(
      TicketStatus.IN_PROGRESS,
    );
  });
});

describe("listChanged cursor", () => {
  const activity = (
    ticketKey: string,
    lastUpdated: string | null,
  ): FleetActivity => ({
    ...UPDATE_SERVICE,
    ticketKey,
    lastUpdated,
  });

  const sessionOf = (rows: FleetActivity[]): Session => ({
    request: vi.fn().mockResolvedValue({
      ok: true,
      json: async () => rows,
    }),
  });

  const drain = async (rows: FleetActivity[], cursor: unknown) => {
    const pages = [];
    for await (const page of listChanged(sessionOf(rows), cursor))
      pages.push(page);
    return pages[0];
  };

  const ROWS = [
    activity("US_1", "2026-09-01T10:00:00"),
    activity("US_2", "2026-09-01T16:55:15"),
    activity("US_3", "2026-08-20T09:00:00"),
  ];

  it("carries everything on the first run and reports the newest stamp", async () => {
    const page = await drain(ROWS, null);

    expect(page.items).toHaveLength(3);
    expect(page.cursor).toEqual({ lastUpdated: "2026-09-01T16:55:15" });
  });

  it("carries only what moved since the watermark", async () => {
    const page = await drain(ROWS, { lastUpdated: "2026-09-01T10:00:00" });

    // Inclusive, so the activity sitting on the watermark comes again rather
    // than risking a loss. The older one is dropped.
    expect(page.items.map((a) => a.ticketKey)).toEqual(["US_1", "US_2"]);
  });

  it("never moves the watermark backwards", async () => {
    const page = await drain([activity("US_9", "2026-01-01T00:00:00")], {
      lastUpdated: "2026-09-01T16:55:15",
    });

    expect(page.cursor).toEqual({ lastUpdated: "2026-09-01T16:55:15" });
  });

  it("carries an unstamped activity that is still open", async () => {
    // No stamp means we cannot show it is unchanged, so it must come through.
    const page = await drain(
      [{ ...activity("US_4", null), activityStatus: "2" }],
      { lastUpdated: "2026-09-01T16:55:15" },
    );

    expect(page.items.map((a) => a.ticketKey)).toEqual(["US_4"]);
  });

  it("skips an unstamped closed activity once the backfill has run", async () => {
    // Fleet omits the stamp on archived closures. The first run took them, and
    // a closure from here on arrives stamped, so re-reading them is pure waste.
    const archived = { ...activity("US_5", null), activityStatus: "4" };

    const backfill = await drain([archived], null);
    expect(backfill.items).toHaveLength(1);

    const later = await drain([archived], {
      lastUpdated: "2026-09-01T16:55:15",
    });
    expect(later.items).toHaveLength(0);
  });

  it("still carries a closure that arrives stamped", async () => {
    const page = await drain(
      [{ ...activity("US_6", "2026-09-02T08:00:00"), activityStatus: "4" }],
      { lastUpdated: "2026-09-01T16:55:15" },
    );

    expect(page.items.map((a) => a.ticketKey)).toEqual(["US_6"]);
  });

  it("ignores a cursor that is not the shape we wrote", async () => {
    const page = await drain(ROWS, "not-a-cursor");

    expect(page.items).toHaveLength(3);
  });
});
