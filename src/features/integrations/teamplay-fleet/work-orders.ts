/**
 * Outbound client for Siemens Healthineers teamplay Fleet.
 *
 * The existing Fleet integration is inbound-only (cron GET /activities →
 * mapFleetActivities → work-order tickets). This module adds the write side:
 * the CDST proposes a work order, the user accepts, and we file it on Fleet.
 *
 * `toFleetCreatePayload` mirrors the payload Fleet's own ticket form submits.
 * Note what is NOT in it: the create call has no schedule fields, so the
 * proposed service window is carried as a "System available date (CLT)" line
 * inside `longText`, exactly as the form does it.
 *
 * Auth is delegated to the shared session client (FLEET, config.ts) that Perry
 * built for the advisory sync — cookie session with Playwright re-auth on 401/403.
 *
 * Deployment config:
 * - FLEET_WORK_ORDER_URL — the create endpoint (the integration URI points at
 *   the /activities READ collection, which is not where tickets are created).
 * - FLEET_SITE_ADDRESS — the Fleet address record Siemens dispatches to, as JSON.
 * - FLEET_CONTACT_PHONE — callback number for the accepting user.
 *
 * Create response (confirmed): `{ ticketKey: "US_…", ticketNumber: "…",
 * attachmentsValidated: bool }`. `ticketKey` is the id we track — same US_…
 * format the inbound /activities sync dedups on, so a re-sync updates this
 * ticket rather than duplicating it.
 */
import "server-only";
import { z } from "zod";
import {
  type Asset,
  type Integration,
  ResourceType,
  type TicketCategory,
} from "@/generated/prisma";
import { MONTHS_SHORT } from "@/lib/date-utils";
import prisma from "@/lib/db";
import { FLEET } from "./config";
import type {
  FleetOperationalStatus,
  FleetPatientDanger,
  FleetSupportType,
} from "./constants";

/** Fleet's host — the authoritative identity of the upstream, as in REST_MAPPERS. */
export const FLEET_HOST = "fleet.siemens-healthineers.com";
export const FLEET_SOURCE_LABEL = "Siemens Healthineers Fleet";

// ─── Integration lookup ──────────────────────────────────────────────────────

/**
 * Every integration pointing at Fleet. A single host can back several
 * integration rows (activities → WorkOrder, equipment → Asset), and an asset is
 * "Siemens-managed" if it's mapped through ANY of them.
 */
export function getFleetIntegrations(): Promise<Integration[]> {
  return prisma.integration.findMany({
    where: { integrationUri: { contains: FLEET_HOST, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * The integration that owns work-order mappings. Prefer the WorkOrder-typed row
 * (the one the inbound /activities sync dedups against) so a ticket we file
 * here is *updated* — not duplicated — when it comes back on the next poll.
 */
export async function getFleetWorkOrderIntegration(): Promise<Integration> {
  const integrations = await getFleetIntegrations();
  const integration =
    integrations.find((i) => i.resourceType === ResourceType.WorkOrder) ??
    integrations[0];

  if (!integration) {
    throw new Error(
      "No Siemens Healthineers Fleet integration is configured — cannot file a Fleet work order.",
    );
  }
  return integration;
}

// ─── Fleet-managed assets (the scoping rule) ─────────────────────────────────

export interface FleetManagedAsset {
  assetId: string;
  hostname: string | null;
  ip: string;
  role: string | null;
  /** Fleet's identifier for the physical device (activities carry it too). */
  equipmentKey: string;
}

function toManagedAsset(
  asset: Asset & { externalMappings: { externalId: string }[] },
): FleetManagedAsset {
  return {
    assetId: asset.id,
    hostname: asset.hostname,
    ip: asset.ip,
    role: asset.role,
    equipmentKey: asset.externalMappings[0].externalId,
  };
}

/**
 * Assets Siemens Healthineers services — i.e. those carrying an
 * ExternalAssetMapping to a Fleet integration, whose externalId is the Fleet
 * equipmentKey. This is the single source of truth for "may we open a Fleet
 * work order for this asset", used by both the agent tool and the accept
 * mutation (the mutation re-checks: never trust the model or the client).
 */
export async function listFleetManagedAssets(): Promise<FleetManagedAsset[]> {
  const integrations = await getFleetIntegrations();
  if (integrations.length === 0) return [];
  const integrationIds = integrations.map((i) => i.id);

  const assets = await prisma.asset.findMany({
    where: {
      externalMappings: { some: { integrationId: { in: integrationIds } } },
    },
    include: {
      externalMappings: {
        where: { integrationId: { in: integrationIds } },
        select: { externalId: true },
        take: 1,
      },
    },
    orderBy: { hostname: "asc" },
  });

  return assets.map(toManagedAsset);
}

export class UnmanagedAssetsError extends Error {
  constructor(public readonly labels: string[]) {
    super(
      `Not managed by Siemens Healthineers, so no Fleet work order can be opened for: ${labels.join(", ")}. Fleet work orders are only available for Siemens-serviced assets.`,
    );
    this.name = "UnmanagedAssetsError";
  }
}

/**
 * Resolve asset ids to their Fleet equipment. Throws UnmanagedAssetsError
 * naming the offenders — the message goes back to the model as the tool result
 * so it can correct itself, and to the user if the accept mutation rejects.
 */
export async function resolveFleetAssets(
  assetIds: string[],
): Promise<FleetManagedAsset[]> {
  const unique = [...new Set(assetIds)];
  const managed = await listFleetManagedAssets();
  const byId = new Map(managed.map((a) => [a.assetId, a]));

  const resolved: FleetManagedAsset[] = [];
  const missing: string[] = [];
  for (const id of unique) {
    const asset = byId.get(id);
    if (asset) resolved.push(asset);
    else missing.push(id);
  }

  if (missing.length > 0) {
    // Label unknown ids with their hostname when the asset exists at all, so the
    // error reads "MRI-01" rather than a cuid the user has never seen.
    const rows = await prisma.asset.findMany({
      where: { id: { in: missing } },
      select: { id: true, hostname: true, ip: true },
    });
    const labels = missing.map((id) => {
      const row = rows.find((r) => r.id === id);
      if (!row) return `${id} (no such asset)`;
      return row.hostname ?? row.ip ?? id;
    });
    throw new UnmanagedAssetsError(labels);
  }

  return resolved;
}

// ─── The write contract ──────────────────────────────────────────────────────

/**
 * Fleet support-ticket type (typeID). Confirmed legend: 11 = Technical Support,
 * 12 = Application Support. Model-set and shown on the approval card.
 */
const FLEET_TYPE_ID: Record<FleetSupportType, string> = {
  technical: "11",
  application: "12",
};

/**
 * Operational status → Fleet problemSeverityID. Model-set and surfaced on the
 * card, so the approver sees exactly what will be sent. Fleet's only two codes
 * (LOWER is worse): "1" = System Not Operational, "2" = System Partially
 * Operational. There is no "fully operational" code — a working device needing a
 * preventive/security update is filed as partially_operational.
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

/** Who Siemens contacts about the order — the VIPER user who accepted it. */
export interface FleetContact {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/**
 * The site Siemens dispatches to. Fleet expects one of its own address records
 * (`type: "existing"` + `addressId`), which VIPER has no way to derive, so it's
 * configured once per deployment via FLEET_SITE_ADDRESS.
 */
const fleetSiteAddressSchema = z.object({
  type: z.string().default("existing"),
  addressId: z.number(),
  locationName: z.string(),
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  tzCode: z.string().default(""),
  tzOffset: z.string().default(""),
});

export type FleetSiteAddress = z.infer<typeof fleetSiteAddressSchema>;

export function getFleetSiteAddress(): FleetSiteAddress {
  const raw = process.env.FLEET_SITE_ADDRESS;
  if (!raw) {
    throw new Error(
      "FLEET_SITE_ADDRESS is not configured — Siemens needs a dispatch address to open a work order.",
    );
  }
  try {
    return fleetSiteAddressSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new Error(
      `FLEET_SITE_ADDRESS is not a valid Fleet address record: ${error instanceof Error ? error.message : error}`,
    );
  }
}

export interface FleetWorkOrderRequest {
  equipmentKey: string;
  summary: string;
  description: string;
  category: TicketCategory;
  /** ISO-8601 with offset; the local wall-clock time is what Fleet displays. */
  scheduledAt?: string | null;
  /** Fleet support type (Technical/Application) → typeID; shown on the card. */
  supportType: FleetSupportType;
  /** Device operational status → Fleet severity; shown on the approval card. */
  operationalStatus: FleetOperationalStatus;
  /** Patient-safety risk → Fleet's three-state dangerForPatient; on the card. */
  dangerForPatient: FleetPatientDanger;
  /** Hospital authorizes after-hours (overtime) service; shown on the card. */
  overtimeAuthorized: boolean;
  contact: FleetContact;
  /** Our own reference, echoed back on the Fleet ticket for correlation. */
  ownIncidentNumber?: string;
}

/**
 * Customer-local time as Fleet writes it: "13-Jul-2026, 09:35".
 *
 * Formatted off the naive part of the ISO string, so the wall-clock time the
 * agent proposed (and the user approved) is the one Siemens reads — no timezone
 * re-interpretation between here and there.
 */
export function formatCltDateTime(iso: string): string | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const monthName = MONTHS_SHORT[Number(month) - 1];
  if (!monthName) return null;
  return `${day}-${monthName}-${year}, ${hour}:${minute}`;
}

/**
 * The create payload has no schedule/overtime fields — Fleet's own form stores
 * them as lines inside longText, joined by ".." (literal double-dots, NOT
 * newlines), and auto-appends:
 *   - "System available date (CLT): …" when a service window is set
 *   - "Overtime authorization: Yes" when overtime is authorized (line omitted
 *     otherwise)
 * Both confirmed against real Fleet create payloads. Urgency and patient-danger
 * are NOT restated here — they ride the structured problemSeverityID /
 * dangerForPatient fields and are shown to the approver on the card.
 */
export function buildFleetLongText(req: FleetWorkOrderRequest): string {
  const parts = [req.description, `Category: ${req.category}`];

  const available = req.scheduledAt ? formatCltDateTime(req.scheduledAt) : null;
  if (available) {
    parts.push(`System available date (CLT): ${available}`);
  }

  if (req.overtimeAuthorized) {
    parts.push("Overtime authorization: Yes");
  }

  parts.push("Raised from VIPER after review by hospital staff.");
  return parts.join("..");
}

/** Pure: request + configured site → Fleet create-ticket payload. */
export function toFleetCreatePayload(
  req: FleetWorkOrderRequest,
  siteAddress: FleetSiteAddress,
) {
  return {
    equipmentKey: req.equipmentKey,
    attachments: [],
    details: {
      teamplayApplication: "",
      typeID: FLEET_TYPE_ID[req.supportType],
      description: req.summary,
      problemSeverityID: FLEET_SEVERITY_ID[req.operationalStatus],
      longText: buildFleetLongText(req),
      protectedCareHours: "",
      componentID: null,
      dangerForPatient: FLEET_DANGER_CODE[req.dangerForPatient],
    },
    contact: {
      contactEmail: req.contact.email,
      contactFirstName: req.contact.firstName,
      contactLastName: req.contact.lastName,
      contactPhone: req.contact.phone,
      contactSalutation: null,
      contactTitle: null,
    },
    request: {
      feedBack: "email",
      feedBackOtherText: "",
      ownIncidentNumber: req.ownIncidentNumber ?? "",
    },
    emailMe: false,
    furtherContacts: [],
    mobileAddress: siteAddress,
  };
}

/**
 * Fleet's create response: `ticketKey` is the id we track (confirmed); the rest
 * are defensive fallbacks in case a variant response omits it. Numbers are
 * coerced: SAP ids come back both as strings and numbers.
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
 * The create endpoint. The configured integration URI points at the READ
 * collection (…/activities?tz=…), which is not where tickets are created, so the
 * write endpoint is configured explicitly via FLEET_WORK_ORDER_URL.
 */
export function fleetWorkOrderUrl(): string {
  const url = process.env.FLEET_WORK_ORDER_URL;
  if (!url) {
    throw new Error(
      "FLEET_WORK_ORDER_URL is not configured — VIPER does not know where to file Siemens Healthineers work orders.",
    );
  }
  return url;
}

export interface FleetWorkOrderResult {
  equipmentKey: string;
  assetId: string;
  externalId: string;
  raw: unknown;
}

/** POST one work order to Fleet. Throws on a non-2xx or an unusable response. */
export async function createFleetWorkOrder(
  asset: FleetManagedAsset,
  req: Omit<FleetWorkOrderRequest, "equipmentKey">,
): Promise<FleetWorkOrderResult> {
  const payload = toFleetCreatePayload(
    { ...req, equipmentKey: asset.equipmentKey },
    getFleetSiteAddress(),
  );

  // Auth (cookie session + Playwright re-auth on 401/403) is handled by the
  // shared FLEET session client; it layers the session header over ours.
  const response = await FLEET.fetchWithSession(fleetWorkOrderUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Fleet rejected the work order for ${asset.hostname ?? asset.ip}: ${response.status} ${response.statusText} ${detail}`.trim(),
    );
  }

  // A 2xx is Fleet accepting the order. Guard the body parse + id extraction so
  // an accepted-but-unreadable response is still recorded as filed — otherwise
  // the caller books a success as a failure and the user re-submits an order
  // Fleet already holds. Fall back to our own reference (ownIncidentNumber /
  // toolCallId) as a provisional external id; the inbound /activities sync
  // reconciles the real Fleet key when the activity next appears.
  let raw: unknown = null;
  let externalId: string;
  try {
    raw = await response.json();
    externalId = extractFleetTicketKey(raw);
  } catch {
    const reference = req.ownIncidentNumber ?? asset.assetId;
    externalId = `pending:${reference}:${asset.equipmentKey}`;
  }

  return {
    equipmentKey: asset.equipmentKey,
    assetId: asset.assetId,
    externalId,
    raw,
  };
}
