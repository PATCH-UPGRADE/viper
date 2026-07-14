import { z } from "zod";
import {
  NotificationChannel,
  TicketCategory,
  TicketStatus,
} from "@/generated/prisma";

// Permissive view of a Siemens Healthineers Fleet /activities record. Only the
// fields we consume are declared; unknown fields are stripped.
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
});

export type FleetActivity = z.infer<typeof fleetActivitySchema>;

// One item as accepted by POST /workOrders/integrationUpload/{token}. `vendorId`
// is the stable external id used for dedup in external_work_order_mappings.
export interface FleetWorkOrderItem {
  vendorId: string;
  summary: string;
  status: TicketStatus;
  category: TicketCategory;
  scheduledAt: string | null;
  sourceLabel: string;
  body: string;
  source: {
    channel: NotificationChannel;
    externalId: string;
    referenceUrl: string | null;
    markdown: string;
    raw: FleetActivity;
  };
}

const DEFAULT_OFFSET = "-05:00";

// The activities URL carries tz=±hh:mm; Fleet's datetimes are naive local values
// in that offset. Fall back to -05:00 when the param is absent.
export function deriveOffsetFromUrl(url: string | null | undefined): string {
  const match = decodeURIComponent(url ?? "").match(
    /[?&]tz=([+-]\d{2}:?\d{2})/,
  );
  return match ? match[1] : DEFAULT_OFFSET;
}

// Append the offset to a naive datetime; leave already-qualified values as-is.
function toIso(dt: string | null | undefined, offset: string): string | null {
  if (!dt) return null;
  return /[Zz]$|[+-]\d{2}:?\d{2}$/.test(dt) ? dt : `${dt}${offset}`;
}

// `scheduled:true` means a service window is booked → treat as in progress.
// Note: Fleet's completedDate is excluded on purpose — it carries the last-done
// date of recurring PMs even for still-open activities, so it must not close a
// ticket. Refine here if Fleet's status-code legend says otherwise.
function mapStatus(a: FleetActivity): TicketStatus {
  return a.scheduled === true ? TicketStatus.IN_PROGRESS : TicketStatus.TO_DO;
}

// "Update Service" (type 3) → software/firmware update. "Maintenance" (type 2),
// including preventive maintenance and safety-related tests, → MAINTENANCE.
function mapCategory(a: FleetActivity): TicketCategory {
  const text = (a.shortText ?? "").toLowerCase();
  if (a.type === "3" || text.includes("update")) {
    return TicketCategory.FIRMWARE_UPDATE;
  }
  if (a.type === "2" || text.includes("maintenance")) {
    return TicketCategory.MAINTENANCE;
  }
  return TicketCategory.OTHER;
}

function buildBody(a: FleetActivity): string {
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

// Permissive view of a Fleet /equipment record — the device inventory Siemens
// services. Only the fields we match on are declared.
const fleetEquipmentSchema = z.object({
  equipmentKey: z.string(),
  serialNumber: z.string().nullish(),
  hostname: z.string().nullish(),
  materialNumber: z.string().nullish(),
  productName: z.string().nullish(),
});

export type FleetEquipment = z.infer<typeof fleetEquipmentSchema>;

/**
 * Map a Fleet /equipment payload. Pure and deterministic. These records are
 * what make an asset "managed by Siemens Healthineers": each one that matches a
 * VIPER asset becomes an ExternalAssetMapping whose externalId is the
 * equipmentKey — the handle Fleet needs to attach a work order to a device.
 */
export function mapFleetEquipment(raw: unknown): FleetEquipment[] {
  return z.array(fleetEquipmentSchema).parse(raw);
}

/**
 * Map a Siemens Healthineers Fleet /activities payload into Work Order upload
 * items. Pure and deterministic. Throws if `raw` isn't the expected array
 * shape; individual records missing a ticketKey fail validation loudly rather
 * than being silently dropped.
 */
export function mapFleetActivities(
  raw: unknown,
  opts: { offset?: string } = {},
): FleetWorkOrderItem[] {
  const activities = z.array(fleetActivitySchema).parse(raw);
  const offset = opts.offset ?? DEFAULT_OFFSET;

  return activities.map((a) => {
    const body = buildBody(a);
    return {
      vendorId: a.ticketKey,
      summary:
        a.activityTitle ??
        `${a.shortText ?? "Activity"}: ${a.qmtext ?? a.ticketKey}`,
      status: mapStatus(a),
      category: mapCategory(a),
      scheduledAt: toIso(a.plannedStart ?? a.dueDate, offset),
      sourceLabel: "Siemens Healthineers Fleet",
      body,
      // Polled from a REST API → PolledApi channel. Drives the source badge and
      // Suggested-tab membership; `raw` keeps the original activity.
      source: {
        channel: NotificationChannel.PolledApi,
        externalId: a.ticketKey,
        referenceUrl: null,
        markdown: body,
        raw: a,
      },
    };
  });
}
