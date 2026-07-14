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
 * Deployment config:
 * - FLEET_WORK_ORDER_URL — the create endpoint (the integration URI points at
 *   the /activities READ collection, which is not where tickets are created).
 * - FLEET_SITE_ADDRESS — the Fleet address record Siemens dispatches to, as JSON.
 * - FLEET_CONTACT_PHONE — callback number for the accepting user.
 *
 * SPEC GAP: we have not seen Fleet's create RESPONSE. `extractFleetTicketKey`
 * accepts the field names it plausibly uses and throws with the raw body when it
 * recognizes none — pin it down there once a real response is in hand.
 */
import "server-only";
import { z } from "zod";
import {
  type Asset,
  AuthType,
  type Integration,
  ResourceType,
  TicketCategory,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import { parseAuthenticationJson } from "@/lib/utils";

/** Fleet's host — the authoritative identity of the upstream, as in REST_MAPPERS. */
export const FLEET_HOST = "fleet.siemens-healthineers.com";
export const FLEET_SOURCE_LABEL = "Siemens Healthineers Fleet";

const FLEET_TIMEOUT_MS = 30_000;

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
 * Ticket type. "11" is what Fleet's own ticket form submits; we have no legend
 * for the other codes, so every VIPER-raised order uses it.
 */
const FLEET_TYPE_ID = "11";

/**
 * Siemens' severity and patient-danger flags are deliberately NOT model-settable
 * — an LLM must not be able to escalate a vendor dispatch. These match what the
 * Fleet form sends for a routine request.
 */
const FLEET_PROBLEM_SEVERITY_ID = "1";
const FLEET_DANGER_FOR_PATIENT = "N";

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
  contact: FleetContact;
  /** Our own reference, echoed back on the Fleet ticket for correlation. */
  ownIncidentNumber?: string;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return null;
  return `${day}-${monthName}-${year}, ${hour}:${minute}`;
}

/**
 * The create payload carries no schedule fields — Fleet's own form encodes the
 * requested window as a "System available date (CLT)" line inside longText, so
 * that is where the proposed service window has to go.
 */
export function buildFleetLongText(req: FleetWorkOrderRequest): string {
  const parts = [req.description, `Category: ${req.category}`];

  const available = req.scheduledAt ? formatCltDateTime(req.scheduledAt) : null;
  if (available) {
    parts.push(`System available date (CLT): ${available}`);
  }

  parts.push("Raised from VIPER after review by hospital staff.");
  return parts.join("\n");
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
      typeID: FLEET_TYPE_ID,
      description: req.summary,
      problemSeverityID: FLEET_PROBLEM_SEVERITY_ID,
      longText: buildFleetLongText(req),
      protectedCareHours: "",
      componentID: null,
      dangerForPatient: FLEET_DANGER_FOR_PATIENT,
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
 * Fleet's create response is the one part of the contract we still haven't seen.
 * We only need whichever field carries the new ticket's stable id — the same id
 * /activities later reports as `ticketKey`, so the inbound sync updates this
 * ticket instead of duplicating it. Numbers are coerced: SAP ids come back both
 * ways.
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
  integration: Integration,
  asset: FleetManagedAsset,
  req: Omit<FleetWorkOrderRequest, "equipmentKey">,
): Promise<FleetWorkOrderResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (integration.authType !== AuthType.None) {
    const { header, value } = parseAuthenticationJson(integration);
    headers[header] = value;
  }

  const payload = toFleetCreatePayload(
    { ...req, equipmentKey: asset.equipmentKey },
    getFleetSiteAddress(),
  );

  const response = await fetch(fleetWorkOrderUrl(), {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(FLEET_TIMEOUT_MS),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Fleet rejected the work order for ${asset.hostname ?? asset.ip}: ${response.status} ${response.statusText} ${detail}`.trim(),
    );
  }

  const raw = await response.json();
  return {
    equipmentKey: asset.equipmentKey,
    assetId: asset.assetId,
    externalId: extractFleetTicketKey(raw),
    raw,
  };
}
