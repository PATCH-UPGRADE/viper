import { describe, expect, it } from "vitest";
import { TicketCategory, TicketStatus } from "@/generated/prisma";
import {
  deriveOffsetFromUrl,
  mapFleetActivities,
  mapFleetEquipment,
} from "./fleet-mapper";

// Representative records from a real Fleet /activities response.
const SAMPLE = [
  {
    ticketKey: "US_400501937577",
    ticketNumber: "400501937577",
    equipmentKey: "US_1064669350",
    type: "3",
    scheduled: false,
    plannedStart: null,
    plannedEnd: null,
    dueDate: "2026-09-11T00:00:00",
    completedDate: "2026-02-20T00:00:00",
    sapSystem: "P40",
    shortText: "Update Service",
    qmtext: "UI-MR049/24/P NX VA60A-SP02",
    activityTitle: "Update Service: UI-MR049/24/P NX VA60A-SP02",
  },
  {
    ticketKey: "US_400301843659",
    ticketNumber: "400301843659",
    equipmentKey: "US_1012141299",
    type: "2",
    scheduled: true,
    plannedStart: "2026-07-22T13:02:00",
    plannedEnd: "2026-07-22T17:32:00",
    dueDate: "2026-03-22T00:00:00",
    completedDate: null,
    sapSystem: "P40",
    shortText: "Maintenance",
    qmtext: "SAFETY RELATED TEST  9Y Annual",
    activityTitle: "Maintenance: SAFETY RELATED TEST  9Y Annual",
  },
];

describe("deriveOffsetFromUrl", () => {
  it("extracts the tz offset from the activities URL", () => {
    expect(
      deriveOffsetFromUrl(
        "https://fleet.siemens-healthineers.com/rest/v1/activities?tz=-05%3A00&statusFilter=1",
      ),
    ).toBe("-05:00");
  });

  it("falls back to -05:00 when tz is absent", () => {
    expect(deriveOffsetFromUrl("https://example.com/x")).toBe("-05:00");
    expect(deriveOffsetFromUrl(null)).toBe("-05:00");
  });
});

describe("mapFleetActivities", () => {
  const items = mapFleetActivities(SAMPLE, { offset: "-05:00" });

  it("uses ticketKey as the dedup vendorId and activityTitle as summary", () => {
    expect(items[0].vendorId).toBe("US_400501937577");
    expect(items[0].summary).toBe(
      "Update Service: UI-MR049/24/P NX VA60A-SP02",
    );
  });

  it("maps an unscheduled Update Service to TO_DO / FIRMWARE_UPDATE", () => {
    expect(items[0].status).toBe(TicketStatus.TO_DO);
    expect(items[0].category).toBe(TicketCategory.FIRMWARE_UPDATE);
  });

  it("maps a scheduled Maintenance to IN_PROGRESS / MAINTENANCE", () => {
    expect(items[1].status).toBe(TicketStatus.IN_PROGRESS);
    expect(items[1].category).toBe(TicketCategory.MAINTENANCE);
  });

  it("appends the offset to naive datetimes (plannedStart, else dueDate)", () => {
    expect(items[0].scheduledAt).toBe("2026-09-11T00:00:00-05:00"); // dueDate
    expect(items[1].scheduledAt).toBe("2026-07-22T13:02:00-05:00"); // plannedStart
  });

  it("does not close still-open activities from completedDate", () => {
    // Record 0 has a completedDate but is an open activity → must stay TO_DO.
    expect(items[0].status).not.toBe(TicketStatus.DONE);
  });

  it("labels the source and includes ticket detail in the body", () => {
    expect(items[0].sourceLabel).toBe("Siemens Healthineers Fleet");
    expect(items[0].body).toContain("400501937577");
    expect(items[0].body).toContain("US_1064669350");
  });

  it("attaches a PolledApi source keyed by ticketKey, preserving the raw record", () => {
    expect(items[0].source.channel).toBe("PolledApi");
    expect(items[0].source.externalId).toBe("US_400501937577");
    expect(items[0].source.raw.ticketKey).toBe("US_400501937577");
    // markdown mirrors the ticket body so the source view has detail.
    expect(items[0].source.markdown).toBe(items[0].body);
  });

  it("throws on a record missing ticketKey rather than dropping it", () => {
    expect(() => mapFleetActivities([{ shortText: "x" }])).toThrow();
  });
});

describe("mapFleetEquipment", () => {
  it("keeps the equipmentKey and the serial number we join assets on", () => {
    const equipment = mapFleetEquipment([
      {
        equipmentKey: "US_1064669350",
        serialNumber: "SH-MAG-2021-001",
        productName: "MAGNETOM Sola",
        siemensOnlyField: "ignored",
      },
    ]);

    expect(equipment[0].equipmentKey).toBe("US_1064669350");
    expect(equipment[0].serialNumber).toBe("SH-MAG-2021-001");
  });

  it("throws on a record missing equipmentKey — the handle a work order needs", () => {
    expect(() => mapFleetEquipment([{ serialNumber: "x" }])).toThrow();
  });
});
