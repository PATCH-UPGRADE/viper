// Used by index.ts and sync.ts, in a separate file to avoid a loop.

import "server-only";
import { z } from "zod";
import { TicketCategory, TicketStatus } from "@/generated/prisma";
import type { Cursor, Page, Session } from "../../../core/types";
import { tableApiPath } from "../urls";

export const CHANGE_REQUEST_TABLE = "change_request";

export const PAGE_SIZE = 1000;

const FIELDS = [
  "sys_id",
  "number",
  "short_description",
  "description",
  "state",
  "type",
  "start_date",
  "end_date",
  "sys_updated_on",
  // Not mapped onto the work order. Requested so that each snapshot records them.
  "category",
  "priority",
  "assignment_group",
  "cmdb_ci",
] as const;

// With `sysparm_display_value=false` every requested field arrives as a string,
// and an empty field as "". A reference field arrives as the target's sys_id.
// The snapshot stores the parsed record, so a field missing here is dropped
// from it.
const changeRequestSchema = z.object({
  sys_id: z.string().min(1),
  number: z.string(),
  short_description: z.string().default(""),
  description: z.string().default(""),
  state: z.string().default(""),
  type: z.string().default(""),
  start_date: z.string().default(""),
  end_date: z.string().default(""),
  sys_updated_on: z.string(),
  category: z.string().default(""),
  priority: z.string().default(""),
  assignment_group: z.string().default(""),
  cmdb_ci: z.string().default(""),
});

export type ChangeRequest = z.infer<typeof changeRequestSchema>;

/**
 * A change request as VIPER models it. `externalId` is the `sys_id` that
 * `external_work_order_mappings` dedups on.
 */
export interface ServiceNowWorkOrderItem {
  externalId: string;
  summary: string;
  status: TicketStatus;
  category: TicketCategory;
  scheduledAt: string | null;
  scheduledEndTime: string | null;
  body: string;
  raw: ChangeRequest;
}

/**
 * The default `change_request` state values. An instance can add its own
 * states, and an unknown one is read as not started.
 */
const STATUS_BY_STATE: Record<string, TicketStatus> = {
  "-5": TicketStatus.TO_DO, // New
  "-4": TicketStatus.TO_DO, // Assess
  "-3": TicketStatus.REQUIRES_APPROVAL, // Authorize
  "-2": TicketStatus.TO_DO, // Scheduled
  "-1": TicketStatus.IN_PROGRESS, // Implement
  "0": TicketStatus.IN_PROGRESS, // Review
  "3": TicketStatus.DONE, // Closed
  "4": TicketStatus.DONE, // Canceled
};

export const mapStatus = (state: string): TicketStatus =>
  STATUS_BY_STATE[state] ?? TicketStatus.TO_DO;

const SERVICENOW_DATETIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

/** A raw ServiceNow datetime ("2026-04-16 23:00:00") is UTC. */
export function toIso(value: string): string | null {
  const match = value.match(SERVICENOW_DATETIME);
  return match ? `${match[1]}T${match[2]}Z` : null;
}

function buildBody(cr: ChangeRequest): string {
  const start = toIso(cr.start_date);
  const end = toIso(cr.end_date);
  return [
    `**${cr.number}**: ${cr.short_description}`,
    "",
    cr.type ? `- Type: ${cr.type}` : null,
    start ? `- Planned: ${start} → ${end ?? "?"}` : null,
    cr.description ? `\n${cr.description}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function toCanonical(raw: ChangeRequest): ServiceNowWorkOrderItem {
  return {
    externalId: raw.sys_id,
    summary: raw.short_description
      ? `${raw.number}: ${raw.short_description}`
      : raw.number,
    status: mapStatus(raw.state),
    category: TicketCategory.OTHER,
    scheduledAt: toIso(raw.start_date),
    scheduledEndTime: toIso(raw.end_date),
    body: buildBody(raw),
    raw,
  };
}

async function readResult(res: Response): Promise<unknown> {
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? "ServiceNow rejected the credentials (401)"
        : `ServiceNow Table API returned ${res.status}`,
    );
  }
  // A hibernating developer instance answers 200 with an HTML wake-up page.
  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new Error(
      "ServiceNow returned a non-JSON response. Check that the instance URL points to an active ServiceNow instance.",
    );
  }
  const body = (await res.json()) as { result?: unknown };
  return body.result;
}

const query = (params: Record<string, string>): string =>
  new URLSearchParams({
    sysparm_fields: FIELDS.join(","),
    sysparm_display_value: "false",
    sysparm_exclude_reference_link: "true",
    ...params,
  }).toString();

async function fetchPage(
  session: Session,
  since: string | null,
  offset: number,
): Promise<ChangeRequest[]> {
  const order = "ORDERBYsys_updated_on^ORDERBYsys_id";
  const res = await session.request(
    `${tableApiPath(CHANGE_REQUEST_TABLE)}?${query({
      sysparm_query: since ? `sys_updated_on>=${since}^${order}` : order,
      sysparm_limit: String(PAGE_SIZE),
      sysparm_offset: String(offset),
      sysparm_no_count: "true",
    })}`,
  );
  return z.array(changeRequestSchema).parse(await readResult(res));
}

/** Round-tripped through `IntegrationResourceSync.cursor`. */
interface ChangeRequestsCursor {
  /**
   * The highest raw `sys_updated_on` this integration has seen, in UTC, but
   * never later than the limit that `listChanged` sets.
   * `sysparm_query` compares it as UTC too, whatever the API user's time zone.
   */
  updatedOn: string;
}

/**
 * How far behind the start of the sync the saved cursor must stay. The margin
 * covers a difference between the VIPER clock and the ServiceNow clock.
 */
const CURSOR_CLOCK_MARGIN_MS = 5 * 60 * 1000;

/** A `Date` in the raw `sys_updated_on` format, in UTC. */
const toServiceNowDateTime = (date: Date): string =>
  date.toISOString().slice(0, 19).replace("T", " ");

const versionOf = (r: ChangeRequest): string =>
  `${r.sys_id}@${r.sys_updated_on}`;

const watermarkOf = (cursor: Cursor | null): string | null => {
  if (!cursor || typeof cursor !== "object") return null;
  const value = (cursor as Partial<ChangeRequestsCursor>).updatedOn;
  return typeof value === "string" ? value : null;
};

/**
 * Pages by keyset on `sys_updated_on`, not by offset alone. A record that
 * changes during the sync moves to the end of the order, and with plain offsets
 * every record behind it shifts back one place, so one is skipped.
 *
 * Each page restarts from the newest timestamp of the one before. The query is
 * inclusive, so records of that second come back again and are dropped by id
 * and timestamp. Only when a full page sits inside one second does the offset
 * advance.
 *
 * A record that changes during the sync comes back with its new timestamp and
 * is yielded again, so the same `sys_id` can occur twice. The caller keeps the
 * last one. A filter by id alone drops the repeat: the cursor then moves past
 * the new version, and VIPER keeps the old one until the record changes again.
 *
 * The saved cursor never passes the start of the sync, minus a clock margin. A
 * record with a future `sys_updated_on` (an import or a script can set one)
 * otherwise moves the cursor past every real edit, and the sync stops seeing
 * changes. That record comes back on every sync instead, and the content hash
 * stops it from writing a new snapshot.
 */
export async function* listChanged(
  session: Session,
  cursor: Cursor | null,
): AsyncIterable<Page<ChangeRequest>> {
  const limit = toServiceNowDateTime(
    new Date(Date.now() - CURSOR_CLOCK_MARGIN_MS),
  );
  let since = watermarkOf(cursor);
  let offset = 0;
  const seen = new Set<string>();

  while (true) {
    const records = await fetchPage(session, since, offset);
    const fresh = records.filter((r) => {
      const version = versionOf(r);
      if (seen.has(version)) return false;
      seen.add(version);
      return true;
    });

    const last = records.at(-1);
    if (last && last.sys_updated_on !== since) {
      since = last.sys_updated_on;
      offset = 0;
    } else {
      offset += PAGE_SIZE;
    }

    const saved = since && since > limit ? limit : since;
    yield { items: fresh, cursor: saved ? { updatedOn: saved } : null };
    if (records.length < PAGE_SIZE) return;
  }
}

export async function get(
  session: Session,
  externalId: string,
): Promise<ChangeRequest> {
  const res = await session.request(
    `${tableApiPath(CHANGE_REQUEST_TABLE)}/${encodeURIComponent(externalId)}?${query({})}`,
  );
  return changeRequestSchema.parse(await readResult(res));
}
