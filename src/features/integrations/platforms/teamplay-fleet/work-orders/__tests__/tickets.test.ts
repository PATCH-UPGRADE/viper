// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TicketCategory } from "@/generated/prisma";
import type { Session } from "../../../../core/types";
import { WORK_ORDER_CREATE_URL } from "../../urls";
import type { FleetSiteAddress, FleetWorkOrderConfig } from "../config";
import { requireSetting } from "../config";
import {
  assertSubmittable,
  buildFleetLongText,
  create,
  extractFleetTicketKey,
  type FleetWorkOrderDraft,
  formatCltDateTime,
  toFleetCreatePayload,
} from "../tickets";

const CONTACT = {
  email: "test.user@example.org",
  firstName: "Test",
  lastName: "User",
  // 555-01xx is the reserved fictional range.
  phone: "5555550100",
};

// The Fleet address record Siemens dispatches to.
const SITE_ADDRESS: FleetSiteAddress = {
  type: "existing",
  addressId: 10000001,
  locationName: "EXAMPLE REGIONAL HOSPITAL",
  street: "1 EXAMPLE WAY",
  city: "SPRINGFIELD",
  state: "IL",
  zip: "60000",
  tzCode: "",
  tzOffset: "",
};

const CONFIG: FleetWorkOrderConfig = {
  contactPhone: "5555550100",
  siteAddress: SITE_ADDRESS,
};

const draft: FleetWorkOrderDraft = {
  equipmentKey: "US_1010600606",
  summary: "Firmware update: MR-MAGNETOM-001",
  description: "Apply the Siemens firmware update.",
  category: TicketCategory.FIRMWARE_UPDATE,
  supportType: "application",
  operationalStatus: "not_operational",
  dangerForPatient: "no",
  overtimeAuthorized: true,
  scheduledAt: "2026-07-13T09:35:00-05:00",
  contact: CONTACT,
  ownIncidentNumber: "call_abc",
};

describe("toFleetCreatePayload", () => {
  const payload = toFleetCreatePayload(draft, SITE_ADDRESS);

  it("sends the equipment, summary and the contact who accepted the order", () => {
    expect(payload.equipmentKey).toBe("US_1010600606");
    expect(payload.details.description).toBe(
      "Firmware update: MR-MAGNETOM-001",
    );
    expect(payload.contact).toEqual({
      contactEmail: "test.user@example.org",
      contactFirstName: "Test",
      contactLastName: "User",
      contactPhone: "5555550100",
      contactSalutation: null,
      contactTitle: null,
    });
  });

  it("maps operational status to Fleet's two severity codes (lower is worse)", () => {
    const sev = (s: "partially_operational" | "not_operational") =>
      toFleetCreatePayload({ ...draft, operationalStatus: s }, SITE_ADDRESS)
        .details.problemSeverityID;
    expect(sev("not_operational")).toBe("1");
    expect(sev("partially_operational")).toBe("2");
  });

  it("maps support type to Fleet's typeID", () => {
    const type = (t: "technical" | "application") =>
      toFleetCreatePayload({ ...draft, supportType: t }, SITE_ADDRESS).details
        .typeID;
    expect(type("technical")).toBe("11");
    expect(type("application")).toBe("12");
  });

  it("maps the three patient-danger states to Fleet's Y/N/U", () => {
    const code = (d: "yes" | "no" | "unknown") =>
      toFleetCreatePayload({ ...draft, dangerForPatient: d }, SITE_ADDRESS)
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
    const longText = buildFleetLongText(draft);

    expect(longText).toContain("Apply the Siemens firmware update.");
    expect(longText).toContain("Category: FIRMWARE_UPDATE");
    // Fleet's own form encodes the requested window this way.
    expect(longText).toContain(
      "System available date (CLT): 13-Jul-2026, 09:35",
    );
  });

  it("joins segments with Fleet's `..` separator, not newlines", () => {
    const longText = buildFleetLongText(draft);
    expect(longText).toContain("..");
    expect(longText).not.toContain("\n");
  });

  it("appends Fleet's overtime line only when authorized, using Fleet's label", () => {
    expect(buildFleetLongText(draft)).toContain("Overtime authorization: Yes");
    expect(
      buildFleetLongText({ ...draft, overtimeAuthorized: false }),
    ).not.toContain("Overtime authorization");
  });

  it("does not restate urgency/patient-danger — those ride the structured fields", () => {
    const longText = buildFleetLongText(draft);
    expect(longText).not.toContain("Operational urgency");
    expect(longText).not.toContain("Patient-safety risk");
  });

  it("omits the window line when no window was proposed", () => {
    const longText = buildFleetLongText({ ...draft, scheduledAt: null });
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

  it("rejects a day the month does not have", () => {
    // Otherwise Siemens is sent "31-Feb-2026" as a real service window.
    expect(formatCltDateTime("2026-02-31T09:00:00-05:00")).toBeNull();
    expect(formatCltDateTime("2026-04-31T09:00:00-05:00")).toBeNull();
    expect(formatCltDateTime("2026-01-00T09:00:00-05:00")).toBeNull();
  });

  it("rejects an impossible time", () => {
    expect(formatCltDateTime("2026-02-31T29:75:00-05:00")).toBeNull();
    expect(formatCltDateTime("2026-07-13T24:00:00-05:00")).toBeNull();
    expect(formatCltDateTime("2026-07-13T09:60:00-05:00")).toBeNull();
  });

  it("keeps the leap day in a leap year and drops it otherwise", () => {
    expect(formatCltDateTime("2028-02-29T09:00:00-05:00")).toBe(
      "29-Feb-2028, 09:00",
    );
    expect(formatCltDateTime("2026-02-29T09:00:00-05:00")).toBeNull();
  });

  it("accepts the boundaries", () => {
    expect(formatCltDateTime("2026-12-31T23:59:00-05:00")).toBe(
      "31-Dec-2026, 23:59",
    );
    expect(formatCltDateTime("2026-01-01T00:00:00-05:00")).toBe(
      "01-Jan-2026, 00:00",
    );
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

describe("requireSetting", () => {
  it("returns the configured value", () => {
    expect(requireSetting(CONFIG, "siteAddress", "why")).toEqual(SITE_ADDRESS);
  });

  it("names the missing setting and says what Fleet needs it for", () => {
    expect(() =>
      requireSetting({}, "siteAddress", "Siemens needs a dispatch address."),
    ).toThrow(/"siteAddress" configured — Siemens needs a dispatch address\./);
  });
});

describe("assertSubmittable", () => {
  it("refuses a patient-safety issue — Fleet requires a phone call", () => {
    expect(() => assertSubmittable({ dangerForPatient: "yes" })).toThrow(
      /report it by phone/,
    );
  });

  it("allows the other two states", () => {
    expect(() => assertSubmittable({ dangerForPatient: "no" })).not.toThrow();
    expect(() =>
      assertSubmittable({ dangerForPatient: "unknown" }),
    ).not.toThrow();
  });
});

describe("create", () => {
  const stubSession = (response: unknown): Session => ({
    request: vi.fn().mockResolvedValue(response),
  });

  const filed: FleetWorkOrderDraft = {
    ...draft,
    equipmentKey: "US_1064669350",
    supportType: "technical",
    operationalStatus: "partially_operational",
    overtimeAuthorized: false,
    scheduledAt: "2026-07-22T22:00:00-05:00",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POSTs the payload through the session and returns the ticket key", async () => {
    const session = stubSession({
      ok: true,
      json: async () => ({ ticketKey: "US_400501937577" }),
    });

    const result = await create(session, filed, CONFIG);

    expect(result.externalId).toBe("US_400501937577");
    const [url, init] = vi.mocked(session.request).mock.calls[0];
    expect(url).toBe(WORK_ORDER_CREATE_URL);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body)).equipmentKey).toBe("US_1064669350");
  });

  it("throws with Fleet's status text on a non-2xx response", async () => {
    const session = stubSession({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => "not authorized",
    });

    await expect(create(session, filed, CONFIG)).rejects.toThrow(
      /403 Forbidden/,
    );
  });

  it("keeps an accepted order when the 2xx body is unparsable, using our reference", async () => {
    // Fleet accepted (2xx) but returned junk. The order exists upstream, so we
    // must NOT surface a failure, which would make the user file it again.
    const session = stubSession({
      ok: true,
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
    });

    const result = await create(session, filed, CONFIG);

    // Provisional id derived from ownIncidentNumber. The inbound sync
    // reconciles the real key later.
    expect(result.externalId).toBe("pending:call_abc:US_1064669350");
    expect(result.raw).toBeNull();
  });

  it("never files a patient-safety issue, whatever the caller passed", async () => {
    const session = stubSession({ ok: true, json: async () => ({}) });

    await expect(
      create(session, { ...filed, dangerForPatient: "yes" }, CONFIG),
    ).rejects.toThrow(/report it by phone/);
    expect(session.request).not.toHaveBeenCalled();
  });

  it("fails before calling Fleet when no dispatch address is configured", async () => {
    const session = stubSession({ ok: true, json: async () => ({}) });

    await expect(
      create(session, filed, { ...CONFIG, siteAddress: undefined }),
    ).rejects.toThrow(/"siteAddress" configured/);
    expect(session.request).not.toHaveBeenCalled();
  });
});
