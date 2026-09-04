/**
 * The outbound half: VIPER files a work order on Fleet.
 *
 * `toFleetCreatePayload` mirrors the payload Fleet's own ticket form submits.
 * Note what is NOT in it: the create call has no schedule fields, so the
 * proposed service window is carried as a "System available date (CLT)" line
 * inside `longText`, exactly as the form does it.
 *
 * Create response (confirmed): `{ ticketKey: "US_…", ticketNumber: "…",
 * attachmentsValidated: bool }`. `ticketKey` is the id we track — the same US_…
 * format the inbound /activities sync dedups on, so a re-sync updates this
 * ticket rather than duplicating it.
 */

import "server-only";
import { z } from "zod";
import type { TicketCategory } from "@/generated/prisma";
import { MONTHS_SHORT } from "@/lib/date-utils";
import type { Session } from "../../../core/types";
import { WORK_ORDER_CREATE_URL } from "../urls";
import {
  type FleetSiteAddress,
  type FleetWorkOrderConfig,
  requireSetting,
} from "./config";
import type {
  FleetOperationalStatus,
  FleetPatientDanger,
  FleetSupportType,
} from "./constants";

/**
 * Fleet support-ticket type (typeID). Confirmed legend: 11 = Technical Support,
 * 12 = Application Support.
 */
const FLEET_TYPE_ID: Record<FleetSupportType, string> = {
  technical: "11",
  application: "12",
};

/**
 * Operational status → Fleet problemSeverityID. Fleet's only two codes (LOWER is
 * worse): "1" = System Not Operational, "2" = System Partially Operational.
 * There is no "fully operational" code, so a working device that needs a
 * preventive or security update is filed as partially_operational.
 */
const FLEET_SEVERITY_ID: Record<FleetOperationalStatus, string> = {
  partially_operational: "2",
  not_operational: "1",
};

/** Fleet's three-state dangerForPatient. Y/N/U all observed in real payloads. */
const FLEET_DANGER_CODE: Record<FleetPatientDanger, string> = {
  yes: "Y",
  no: "N",
  unknown: "U",
};

/** Who Siemens contacts about the order — the VIPER user who approved it. */
export interface FleetContact {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/** What VIPER sends to open one Fleet work order, for one piece of equipment. */
export interface FleetWorkOrderDraft {
  equipmentKey: string;
  summary: string;
  description: string;
  category: TicketCategory;
  /** ISO-8601 with offset; the local wall-clock time is what Fleet displays. */
  scheduledAt?: string | null;
  supportType: FleetSupportType;
  operationalStatus: FleetOperationalStatus;
  dangerForPatient: FleetPatientDanger;
  overtimeAuthorized: boolean;
  contact: FleetContact;
  /** Our own reference, echoed back on the Fleet ticket for correlation. */
  ownIncidentNumber?: string;
}

/**
 * Fleet does not accept a patient-safety issue online — Siemens requires a phone
 * call. The chat card and the approval mutation both refuse earlier for the sake
 * of the message, and this is the backstop that no caller can bypass.
 */
export function assertSubmittable(draft: {
  dangerForPatient: FleetPatientDanger;
}): void {
  if (draft.dangerForPatient === "yes") {
    throw new Error(
      "A patient-safety issue cannot be filed as an online work order — Siemens Healthineers requires you to report it by phone.",
    );
  }
}

/**
 * Customer-local time as Fleet writes it: "13-Jul-2026, 09:35".
 *
 * Formatted off the naive part of the ISO string, so the wall-clock time the
 * agent proposed, and the user approved, is the one Siemens reads. Nothing
 * re-interprets the timezone between here and there.
 */
export function formatCltDateTime(iso: string): string | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;

  const monthName = MONTHS_SHORT[Number(month) - 1];
  if (!monthName) return null;
  if (Number(hour) > 23 || Number(minute) > 59) return null;

  // The pattern matches any four digits, so reject a day the month does not
  // have. Otherwise "2026-02-31" reaches Siemens as a real service window.
  // Building the date rolls an overflowing day into the next month, which the
  // comparison below catches. Leap years come out of that for free.
  const asDate = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  if (
    asDate.getUTCMonth() !== Number(month) - 1 ||
    asDate.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return `${day}-${monthName}-${year}, ${hour}:${minute}`;
}

/**
 * The create payload has no schedule or overtime fields. Fleet's own form stores
 * them as lines inside longText, joined by ".." (literal double dots, NOT
 * newlines), and appends:
 *   - "System available date (CLT): …" when a service window is set
 *   - "Overtime authorization: Yes" when overtime is authorized (the line is
 *     omitted otherwise)
 * Urgency and patient danger are not restated here: they ride the structured
 * problemSeverityID and dangerForPatient fields.
 */
export function buildFleetLongText(draft: FleetWorkOrderDraft): string {
  const parts = [draft.description, `Category: ${draft.category}`];

  const available = draft.scheduledAt
    ? formatCltDateTime(draft.scheduledAt)
    : null;
  if (available) {
    parts.push(`System available date (CLT): ${available}`);
  }

  if (draft.overtimeAuthorized) {
    parts.push("Overtime authorization: Yes");
  }

  parts.push("Raised from VIPER after review by hospital staff.");
  return parts.join("..");
}

/** Pure: draft + configured site → Fleet create-ticket payload. */
export function toFleetCreatePayload(
  draft: FleetWorkOrderDraft,
  siteAddress: FleetSiteAddress,
) {
  return {
    equipmentKey: draft.equipmentKey,
    attachments: [],
    details: {
      teamplayApplication: "",
      typeID: FLEET_TYPE_ID[draft.supportType],
      description: draft.summary,
      problemSeverityID: FLEET_SEVERITY_ID[draft.operationalStatus],
      longText: buildFleetLongText(draft),
      protectedCareHours: "",
      componentID: null,
      dangerForPatient: FLEET_DANGER_CODE[draft.dangerForPatient],
    },
    contact: {
      contactEmail: draft.contact.email,
      contactFirstName: draft.contact.firstName,
      contactLastName: draft.contact.lastName,
      contactPhone: draft.contact.phone,
      contactSalutation: null,
      contactTitle: null,
    },
    request: {
      feedBack: "email",
      feedBackOtherText: "",
      ownIncidentNumber: draft.ownIncidentNumber ?? "",
    },
    emailMe: false,
    furtherContacts: [],
    mobileAddress: siteAddress,
  };
}

/**
 * Fleet's create response: `ticketKey` is the id we track (confirmed); the rest
 * are fallbacks in case a variant response omits it. Numbers are coerced,
 * because SAP ids come back both as strings and as numbers.
 */
const fleetCreateResponseSchema = z.object({
  ticketKey: z.coerce.string().nullish(),
  ticketNumber: z.coerce.string().nullish(),
  incidentNumber: z.coerce.string().nullish(),
  ticketId: z.coerce.string().nullish(),
  id: z.coerce.string().nullish(),
});

/** Pure: pull the new work order's stable external id out of Fleet's response. */
export function extractFleetTicketKey(raw: unknown): string {
  const parsed = fleetCreateResponseSchema.safeParse(raw);
  const data = parsed.success ? parsed.data : null;
  const key =
    data?.ticketKey ??
    data?.ticketNumber ??
    data?.incidentNumber ??
    data?.ticketId ??
    data?.id;

  if (!key) {
    // Echo the body: without an id we cannot link the Fleet order to a ticket,
    // and a silent guess would let the inbound sync duplicate it.
    throw new Error(
      `Fleet accepted the work order but returned no recognizable ticket id — cannot track it in VIPER. Response: ${JSON.stringify(raw)}`,
    );
  }
  return key;
}

/**
 * Marks an external id VIPER minted itself because Fleet accepted the order but
 * returned an unreadable body. The inbound sync reconciles it against the real
 * ticket key by matching `ownIncidentNumber`.
 */
export const PROVISIONAL_PREFIX = "pending:";

export const provisionalExternalId = (
  reference: string,
  equipmentKey: string,
): string => `${PROVISIONAL_PREFIX}${reference}:${equipmentKey}`;

/** POST one work order to Fleet. Throws on a non-2xx or an unusable response. */
export async function create(
  session: Session,
  draft: FleetWorkOrderDraft,
  config: FleetWorkOrderConfig,
): Promise<{ externalId: string; raw: unknown }> {
  assertSubmittable(draft);

  const siteAddress = requireSetting(
    config,
    "siteAddress",
    "Siemens needs a dispatch address to open a work order.",
  );

  const response = await session.request(WORK_ORDER_CREATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(toFleetCreatePayload(draft, siteAddress)),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Fleet rejected the work order for ${draft.equipmentKey}: ${response.status} ${response.statusText} ${detail}`.trim(),
    );
  }

  // A 2xx is Fleet accepting the order. Guard the body parse and the id
  // extraction so an accepted-but-unreadable response is still recorded as
  // filed. Otherwise the caller books a success as a failure and the user
  // re-submits an order Fleet already holds.
  let raw: unknown = null;
  try {
    raw = await response.json();
    return { externalId: extractFleetTicketKey(raw), raw };
  } catch {
    const reference = draft.ownIncidentNumber ?? draft.equipmentKey;
    return {
      externalId: provisionalExternalId(reference, draft.equipmentKey),
      raw,
    };
  }
}
