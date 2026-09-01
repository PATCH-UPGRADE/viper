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
  activityStatus: z.string().nullish(),
  completedDate: z.string().nullish(),
  lastUpdated: z.string().nullish(),
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

/** Fleet activityStatus codes that mean the work is finished. */
const CLOSED_ACTIVITY_STATUSES = new Set(["3", "4"]);

const isClosed = (a: FleetActivity): boolean =>
  Boolean(a.activityStatus && CLOSED_ACTIVITY_STATUSES.has(a.activityStatus));

// `scheduled:true` means a service window is booked → treat as in progress.
//
// Closure comes from activityStatus, not from completedDate. completedDate
// carries the last-done date of recurring preventive maintenance and is set on
// activities that are still open, so reading it would close live tickets.
function mapStatus(a: FleetActivity): TicketStatus {
  if (isClosed(a)) return TicketStatus.DONE;
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

/** Round-tripped through `IntegrationResourceSync.cursor`. */
export interface ActivitiesCursor {
  /** The highest `lastUpdated` this integration has seen. */
  lastUpdated: string;
}

const watermarkOf = (cursor: Cursor | null): string | null => {
  if (!cursor || typeof cursor !== "object") return null;
  const value = (cursor as Partial<ActivitiesCursor>).lastUpdated;
  return typeof value === "string" ? value : null;
};

export async function* listChanged(
  session: Session,
  cursor: Cursor | null,
): AsyncIterable<Page<FleetActivity>> {
  // Fleet's /activities cannot paginate, and offers no "changed since"
  // parameter, so the whole collection comes back every time and the watermark
  // is applied here. That still spares the ingest and the snapshot writes.
  const all = await fetchActivities(session);
  const since = watermarkOf(cursor);

  // `lastUpdated` is a zero-padded naive datetime, so comparing the strings is
  // chronological. The comparison is inclusive: an activity that moved within
  // the same second as the watermark is carried again rather than lost, and the
  // content hash keeps the repeat from writing a second snapshot.
  //
  // Fleet maintains the stamp on live work and omits it on archived closures.
  // An unstamped activity that is still open is therefore carried, because it
  // cannot be shown to be unchanged, while an unstamped closed one is settled
  // history that the first run already took. A closure that happens from here on
  // arrives stamped, so it still passes the watermark.
  const items = since
    ? all.filter((a) => (a.lastUpdated ? a.lastUpdated >= since : !isClosed(a)))
    : all;

  // Taken across everything Fleet returned, not just what passed the filter, and
  // seeded with the old value so it can never move backwards.
  let newest = since;
  for (const a of all) {
    if (a.lastUpdated && (!newest || a.lastUpdated > newest)) {
      newest = a.lastUpdated;
    }
  }

  yield { items, cursor: newest ? { lastUpdated: newest } : null };
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
