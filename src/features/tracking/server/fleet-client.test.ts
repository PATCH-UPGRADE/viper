// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    integration: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { TicketCategory } from "@/generated/prisma";
import {
  buildFleetLongText,
  extractFleetTicketKey,
  type FleetSiteAddress,
  fleetWorkOrderUrl,
  formatCltDateTime,
  getFleetSiteAddress,
  listFleetManagedAssets,
  resolveFleetAssets,
  toFleetCreatePayload,
  UnmanagedAssetsError,
} from "./fleet-client";

const FLEET_INTEGRATION = {
  id: "int-fleet",
  integrationUri:
    "https://fleet.siemens-healthineers.com/rest/v1/activities?tz=-05:00",
  resourceType: "WorkOrder",
};

// An asset row as returned with the Fleet mapping included.
const managedAsset = (id: string, hostname: string, equipmentKey: string) => ({
  id,
  hostname,
  ip: "10.40.1.60",
  role: "MRI Scanner",
  externalMappings: [{ externalId: equipmentKey }],
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FLEET_WORK_ORDER_URL;
  mockPrisma.integration.findMany.mockResolvedValue([FLEET_INTEGRATION]);
});

const CONTACT = {
  email: "mark.glose@bugcrowd.com",
  firstName: "Mark",
  lastName: "Glose",
  phone: "4055555555",
};

// The Fleet address record Siemens dispatches to (FLEET_SITE_ADDRESS).
const SITE_ADDRESS: FleetSiteAddress = {
  type: "existing",
  addressId: 16318179,
  locationName: "ADVANCED MOBILITY BY KENTUCKY",
  street: "611 COMMERCE CENTER DRIVE",
  city: "UNIVERSITY PARK",
  state: "IL",
  zip: "60484",
  tzCode: "",
  tzOffset: "",
};

const request = {
  equipmentKey: "US_1010600606",
  summary: "Firmware update: MR-MAGNETOM-001",
  description: "Apply the Siemens firmware update.",
  category: TicketCategory.FIRMWARE_UPDATE,
  scheduledAt: "2026-07-13T09:35:00-05:00",
  contact: CONTACT,
  ownIncidentNumber: "call_abc",
};

describe("toFleetCreatePayload", () => {
  const payload = toFleetCreatePayload(request, SITE_ADDRESS);

  it("sends the equipment, summary and the contact who accepted the order", () => {
    expect(payload.equipmentKey).toBe("US_1010600606");
    expect(payload.details.description).toBe(
      "Firmware update: MR-MAGNETOM-001",
    );
    expect(payload.contact).toEqual({
      contactEmail: "mark.glose@bugcrowd.com",
      contactFirstName: "Mark",
      contactLastName: "Glose",
      contactPhone: "4055555555",
      contactSalutation: null,
      contactTitle: null,
    });
  });

  it("pins severity and patient-danger to fixed values the model cannot raise", () => {
    expect(payload.details.typeID).toBe("11");
    expect(payload.details.problemSeverityID).toBe("1");
    expect(payload.details.dangerForPatient).toBe("N");
  });

  it("carries our proposal id as the customer's own incident number", () => {
    expect(payload.request.ownIncidentNumber).toBe("call_abc");
    expect(payload.request.feedBack).toBe("email");
  });

  it("dispatches to the configured site address", () => {
    expect(payload.mobileAddress).toEqual(SITE_ADDRESS);
  });
});

describe("buildFleetLongText", () => {
  it("carries the service window — the create call has no schedule fields", () => {
    const longText = buildFleetLongText(request);

    expect(longText).toContain("Apply the Siemens firmware update.");
    expect(longText).toContain("Category: FIRMWARE_UPDATE");
    // Fleet's own form encodes the requested window this way.
    expect(longText).toContain(
      "System available date (CLT): 13-Jul-2026, 09:35",
    );
  });

  it("omits the window line when no window was proposed", () => {
    const longText = buildFleetLongText({ ...request, scheduledAt: null });
    expect(longText).not.toContain("System available date");
  });
});

describe("formatCltDateTime", () => {
  it("formats customer-local time the way Fleet writes it", () => {
    expect(formatCltDateTime("2026-07-13T09:35:00-05:00")).toBe(
      "13-Jul-2026, 09:35",
    );
  });

  it("uses the wall-clock time as proposed, not a UTC re-interpretation", () => {
    // 22:00 local stays 22:00 — the window the user approved is what Siemens reads.
    expect(formatCltDateTime("2026-07-22T22:00:00-05:00")).toBe(
      "22-Jul-2026, 22:00",
    );
  });

  it("returns null for an unparseable value rather than a wrong date", () => {
    expect(formatCltDateTime("next tuesday")).toBeNull();
  });
});

describe("getFleetSiteAddress", () => {
  it("parses the configured Fleet address record", () => {
    process.env.FLEET_SITE_ADDRESS = JSON.stringify(SITE_ADDRESS);
    expect(getFleetSiteAddress()).toEqual(SITE_ADDRESS);
  });

  it("fails loudly when unset — Siemens needs somewhere to dispatch", () => {
    delete process.env.FLEET_SITE_ADDRESS;
    expect(() => getFleetSiteAddress()).toThrow(/FLEET_SITE_ADDRESS/);
  });
});

describe("extractFleetTicketKey", () => {
  it("prefers ticketKey, the id the inbound sync dedups on", () => {
    expect(
      extractFleetTicketKey({
        ticketKey: "US_400501937577",
        ticketNumber: "400501937577",
      }),
    ).toBe("US_400501937577");
  });

  it("accepts the other id fields Fleet may return, including numbers", () => {
    expect(extractFleetTicketKey({ ticketNumber: 400501937577 })).toBe(
      "400501937577",
    );
    expect(extractFleetTicketKey({ incidentNumber: "INC-1" })).toBe("INC-1");
    expect(extractFleetTicketKey({ id: "abc" })).toBe("abc");
  });

  it("throws with the body when no id is recognizable", () => {
    // Better to fail than to guess: a wrong external id would let the inbound
    // sync duplicate the ticket.
    expect(() => extractFleetTicketKey({ status: "ok" })).toThrow(
      /Response: {"status":"ok"}/,
    );
  });
});

describe("fleetWorkOrderUrl", () => {
  it("returns the configured create endpoint", () => {
    process.env.FLEET_WORK_ORDER_URL = "http://localhost:4010/workorders";
    expect(fleetWorkOrderUrl()).toBe("http://localhost:4010/workorders");
  });

  it("fails loudly when unset — the /activities URI is a read collection", () => {
    delete process.env.FLEET_WORK_ORDER_URL;
    expect(() => fleetWorkOrderUrl()).toThrow(/FLEET_WORK_ORDER_URL/);
  });
});

describe("listFleetManagedAssets", () => {
  it("returns assets mapped to Fleet, keyed by their equipment", async () => {
    mockPrisma.asset.findMany.mockResolvedValue([
      managedAsset("a1", "MR-MAGNETOM-001", "US_1064669350"),
    ]);

    const assets = await listFleetManagedAssets();

    expect(assets).toEqual([
      {
        assetId: "a1",
        hostname: "MR-MAGNETOM-001",
        ip: "10.40.1.60",
        role: "MRI Scanner",
        equipmentKey: "US_1064669350",
      },
    ]);
  });

  it("returns nothing when no Fleet integration is configured", async () => {
    mockPrisma.integration.findMany.mockResolvedValue([]);
    expect(await listFleetManagedAssets()).toEqual([]);
    expect(mockPrisma.asset.findMany).not.toHaveBeenCalled();
  });
});

describe("resolveFleetAssets", () => {
  it("resolves Siemens-managed assets to their equipment keys", async () => {
    mockPrisma.asset.findMany.mockResolvedValue([
      managedAsset("a1", "MR-MAGNETOM-001", "US_1064669350"),
    ]);

    const resolved = await resolveFleetAssets(["a1"]);
    expect(resolved.map((a) => a.equipmentKey)).toEqual(["US_1064669350"]);
  });

  it("refuses an asset Siemens does not manage, naming it by hostname", async () => {
    // Only the MRI is Fleet-managed; the infusion pump is not.
    mockPrisma.asset.findMany
      .mockResolvedValueOnce([
        managedAsset("a1", "MR-MAGNETOM-001", "US_1064669350"),
      ])
      // The lookup that labels the rejected ids.
      .mockResolvedValueOnce([
        { id: "a2", hostname: "PUMP-SIGMA-001", ip: "10.20.4.101" },
      ]);

    const error = await resolveFleetAssets(["a1", "a2"]).catch((e) => e);

    expect(error).toBeInstanceOf(UnmanagedAssetsError);
    expect(error.message).toMatch(/PUMP-SIGMA-001/);
  });
});
