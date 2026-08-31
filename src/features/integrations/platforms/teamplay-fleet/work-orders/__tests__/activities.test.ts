// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TicketCategory, TicketStatus } from "@/generated/prisma";
import { type FleetActivity, toCanonical } from "../activities";

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
