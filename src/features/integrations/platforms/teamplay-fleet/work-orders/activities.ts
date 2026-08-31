// Used by index.ts and sync.ts, in a separate file to avoid a loop.

import "server-only";
import { z } from "zod";
import { TicketCategory, TicketStatus } from "@/generated/prisma";
import type { Cursor, Page, Session } from "../../../core/types";
import { ACTIVITIES_URL, FLEET_TZ_OFFSET } from "../urls";

// Permissive view of a Fleet /activities record. Only the fields we consume are
// declared; unknown fields are stripped.
const fleetActivitySchema = z.object({
  ticketKey: z.string(),
  ticketNumber: z.string().nullish(),
  equipmentKey: z.string().nullish(),
  type: z.string().nullish(),
  scheduled: z.boolean().nullish(),
  plannedStart: z.string().nullish(),
  plannedEnd: z.string().nullish(),
  dueDate: z.string().nullish(),
  sapSystem: z.string().nullish(),
  shortText: z.string().nullish(),
  qmtext: z.string().nullish(),
  activityTitle: z.string().nullish(),
  // Echoed back for an order VIPER filed. Reconciles the provisional mapping
  // written when Fleet accepted the order but returned no readable ticket id.
  ownIncidentNumber: z.string().nullish(),
});

export type FleetActivity = z.infer<typeof fleetActivitySchema>;

/**
 * A Fleet activity as VIPER models it. `vendorId` is the stable external id that
 * `external_work_order_mappings` dedups on.
 */
export interface FleetWorkOrderItem {
  vendorId: string;
  /** Fleet's id for the equipment this activity is against; null when Fleet omits it. */
  equipmentKey: string | null;
  summary: string;
  status: TicketStatus;
  category: TicketCategory;
  scheduledAt: string | null;
  body: string;
  ownIncidentNumber: string | null;
  raw: FleetActivity;
}

// Append the offset to a naive datetime; leave already-qualified values as-is.
function toIso(dt: string | null | undefined): string | null {
  if (!dt) return null;
  return /[Zz]$|[+-]\d{2}:?\d{2}$/.test(dt) ? dt : `${dt}${FLEET_TZ_OFFSET}`;
}

// `scheduled:true` means a service window is booked → treat as in progress.
// Fleet's completedDate is excluded on purpose: it carries the last-done date of
// recurring preventive maintenance even for still-open activities, so it must
// not close a ticket.
function mapStatus(a: FleetActivity): TicketStatus {
  return a.scheduled === true ? TicketStatus.IN_PROGRESS : TicketStatus.TO_DO;
}

// "Update Service" (type 3) → software/firmware update. "Maintenance" (type 2),
// including preventive maintenance and safety-related tests, → MAINTENANCE.
const CATEGORY_BY_TYPE: Record<string, TicketCategory> = {
  "2": TicketCategory.MAINTENANCE,
  "3": TicketCategory.FIRMWARE_UPDATE,
};

// The type code is what Fleet documents, so it decides. Reading the wording
// first would file type 2 "Update maintenance" as a firmware update. The text is
// only a fallback for an activity carrying no code we recognise.
function mapCategory(a: FleetActivity): TicketCategory {
  const byType = a.type ? CATEGORY_BY_TYPE[a.type] : undefined;
  if (byType) return byType;

  const text = (a.shortText ?? "").toLowerCase();
  if (text.includes("update")) return TicketCategory.FIRMWARE_UPDATE;
  if (text.includes("maintenance")) return TicketCategory.MAINTENANCE;
  return TicketCategory.OTHER;
}

export function buildBody(a: FleetActivity): string {
  return [
    `**${a.activityTitle ?? a.shortText ?? "Fleet activity"}**`,
    "",
    a.ticketNumber ? `- Ticket: ${a.ticketNumber}` : null,
    a.equipmentKey ? `- Equipment: ${a.equipmentKey}` : null,
    a.qmtext ? `- Description: ${a.qmtext}` : null,
    a.dueDate ? `- Due: ${a.dueDate.slice(0, 10)}` : null,
    a.plannedStart
      ? `- Planned: ${a.plannedStart} → ${a.plannedEnd ?? "?"}`
      : null,
    a.sapSystem ? `- SAP system: ${a.sapSystem}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchActivities(session: Session): Promise<FleetActivity[]> {
  const res = await session.request(ACTIVITIES_URL);
  if (!res.ok) {
    throw new Error(`Fleet /activities returned ${res.status}`);
  }
  return z.array(fleetActivitySchema).parse(await res.json());
}

export async function* listChanged(
  session: Session,
  _cursor: Cursor | null,
): AsyncIterable<Page<FleetActivity>> {
  // Fleet's /activities cannot paginate or filter by change; every sync is the
  // full collection.
  yield { items: await fetchActivities(session), cursor: null };
}

export async function get(
  session: Session,
  externalId: string,
): Promise<FleetActivity> {
  const all = await fetchActivities(session);
  const found = all.find((a) => a.ticketKey === externalId);
  if (!found) {
    throw new Error(`Fleet has no activity ${externalId}`);
  }
  return found;
}

export function toCanonical(raw: FleetActivity): FleetWorkOrderItem {
  return {
    vendorId: raw.ticketKey,
    equipmentKey: raw.equipmentKey ?? null,
    summary:
      raw.activityTitle ??
      `${raw.shortText ?? "Activity"}: ${raw.qmtext ?? raw.ticketKey}`,
    status: mapStatus(raw),
    category: mapCategory(raw),
    scheduledAt: toIso(raw.plannedStart ?? raw.dueDate),
    body: buildBody(raw),
    ownIncidentNumber: raw.ownIncidentNumber ?? null,
    raw,
  };
}
