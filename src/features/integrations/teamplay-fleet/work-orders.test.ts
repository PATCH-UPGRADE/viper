// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    integration: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

// Auth is delegated to the shared FLEET session client; stub it so the tests
// don't pull in Playwright/chromium and can assert the outbound request.
const { mockFleetSession } = vi.hoisted(() => ({
  mockFleetSession: { fetchWithSession: vi.fn() },
}));

vi.mock("./config", () => ({ FLEET: mockFleetSession }));

import { TicketCategory } from "@/generated/prisma";
import {
  buildFleetLongText,
  createFleetWorkOrder,
  extractFleetTicketKey,
  type FleetManagedAsset,
  type FleetSiteAddress,
  fleetWorkOrderUrl,
  formatCltDateTime,
  getFleetSiteAddress,
  getFleetWorkOrderIntegration,
  listFleetManagedAssets,
  resolveFleetAssets,
  toFleetCreatePayload,
  UnmanagedAssetsError,
} from "./work-orders";

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
  supportType: "application" as const,
  operationalStatus: "not_operational" as const,
  dangerForPatient: "no" as const,
  overtimeAuthorized: true,
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

  it("maps the model-set support type, status and patient-danger into the payload", () => {
    // supportType "application" → typeID "12"; not_operational → severity "1";
    // dangerForPatient "no" → "N".
    expect(payload.details.typeID).toBe("12");
    expect(payload.details.problemSeverityID).toBe("1");
    expect(payload.details.dangerForPatient).toBe("N");
  });

  it("maps operational status to Fleet's two severity codes (lower is worse)", () => {
    const sev = (s: "partially_operational" | "not_operational") =>
      toFleetCreatePayload({ ...request, operationalStatus: s }, SITE_ADDRESS)
        .details.problemSeverityID;
    expect(sev("not_operational")).toBe("1");
    expect(sev("partially_operational")).toBe("2");
  });

  it("maps support type to Fleet's typeID", () => {
    const type = (t: "technical" | "application") =>
      toFleetCreatePayload({ ...request, supportType: t }, SITE_ADDRESS).details
        .typeID;
    expect(type("technical")).toBe("11");
    expect(type("application")).toBe("12");
  });

  it("maps the three patient-danger states to Fleet's Y/N/U", () => {
    const code = (d: "yes" | "no" | "unknown") =>
      toFleetCreatePayload({ ...request, dangerForPatient: d }, SITE_ADDRESS)
        .details.dangerForPatient;
    expect(code("yes")).toBe("Y");
    expect(code("no")).toBe("N");
    expect(code("unknown")).toBe("U");
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

  it("joins segments with Fleet's `..` separator, not newlines", () => {
    const longText = buildFleetLongText(request);
    expect(longText).toContain("..");
    expect(longText).not.toContain("\n");
  });

  it("appends Fleet's overtime line only when authorized, using Fleet's label", () => {
    expect(buildFleetLongText(request)).toContain(
      "Overtime authorization: Yes",
    );
    expect(
      buildFleetLongText({ ...request, overtimeAuthorized: false }),
    ).not.toContain("Overtime authorization");
  });

  it("does not restate urgency/patient-danger — those ride the structured fields", () => {
    const longText = buildFleetLongText(request);
    expect(longText).not.toContain("Operational urgency");
    expect(longText).not.toContain("Patient-safety risk");
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

describe("getFleetWorkOrderIntegration", () => {
  it("prefers the WorkOrder-typed integration (the sync dedups against it)", async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      { id: "int-asset", resourceType: "Asset" },
      { id: "int-wo", resourceType: "WorkOrder" },
    ]);

    const integration = await getFleetWorkOrderIntegration();
    expect(integration.id).toBe("int-wo");
  });

  it("falls back to the first Fleet integration when none is WorkOrder-typed", async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      { id: "int-asset", resourceType: "Asset" },
    ]);

    const integration = await getFleetWorkOrderIntegration();
    expect(integration.id).toBe("int-asset");
  });

  it("throws when no Fleet integration is configured", async () => {
    mockPrisma.integration.findMany.mockResolvedValue([]);
    await expect(getFleetWorkOrderIntegration()).rejects.toThrow(
      /No Siemens Healthineers Fleet integration/,
    );
  });
});

describe("createFleetWorkOrder", () => {
  const asset: FleetManagedAsset = {
    assetId: "rad-mri-001",
    hostname: "MR-MAGNETOM-001",
    ip: "10.40.1.60",
    role: "MRI Scanner",
    equipmentKey: "US_1064669350",
  };
  const req = {
    summary: "Firmware update: MR-MAGNETOM-001",
    description: "Apply the Siemens firmware update.",
    category: TicketCategory.FIRMWARE_UPDATE,
    supportType: "technical" as const,
    operationalStatus: "partially_operational" as const,
    dangerForPatient: "no" as const,
    overtimeAuthorized: false,
    scheduledAt: "2026-07-22T22:00:00-05:00",
    contact: CONTACT,
    ownIncidentNumber: "call_abc",
  };

  beforeEach(() => {
    process.env.FLEET_WORK_ORDER_URL = "http://localhost:4010/workorders";
    process.env.FLEET_SITE_ADDRESS = JSON.stringify(SITE_ADDRESS);
  });

  afterEach(() => {
    delete process.env.FLEET_SITE_ADDRESS;
  });

  it("POSTs the payload through the shared session client and returns the ticket key", async () => {
    mockFleetSession.fetchWithSession.mockResolvedValue({
      ok: true,
      json: async () => ({ ticketKey: "US_400501937577" }),
    });

    const result = await createFleetWorkOrder(asset, req);

    expect(result.externalId).toBe("US_400501937577");
    expect(result.equipmentKey).toBe("US_1064669350");
    // Auth goes through FLEET.fetchWithSession, not a bare fetch.
    const [url, init] = mockFleetSession.fetchWithSession.mock.calls[0];
    expect(url).toBe("http://localhost:4010/workorders");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).equipmentKey).toBe("US_1064669350");
  });

  it("throws with Fleet's status text on a non-2xx response", async () => {
    mockFleetSession.fetchWithSession.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => "not authorized",
    });

    await expect(createFleetWorkOrder(asset, req)).rejects.toThrow(
      /403 Forbidden/,
    );
  });

  it("keeps an accepted order when the 2xx body is unparsable, using our reference", async () => {
    // Fleet accepted (2xx) but returned junk — the order exists upstream, so we
    // must NOT surface a failure (which would make the user re-file it).
    mockFleetSession.fetchWithSession.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
    });

    const result = await createFleetWorkOrder(asset, req);

    // Provisional id derived from ownIncidentNumber; the inbound sync reconciles
    // the real key later.
    expect(result.externalId).toBe("pending:call_abc:US_1064669350");
    expect(result.raw).toBeNull();
  });
});
