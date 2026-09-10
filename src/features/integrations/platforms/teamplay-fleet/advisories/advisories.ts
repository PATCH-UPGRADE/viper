import "server-only";
import { z } from "zod";
import { cvssBand } from "@/features/vulnerabilities/utils";
import type { Cursor, Page, Session } from "../../../core/types";
import { ADVISORIES_URL, advisoryAttachmentsUrl } from "../urls";
import { buildRow, buildText } from "../utils";

const fleetAdvisorySchema = z.object({
  id: z.number(),
  advisoryId: z.string().nullish(), // The advisory label "SSA-016040"
  title: z.string().nullish(),
  cveIds: z.string().nullish(),
  cvssScore: z.number().nullish(),
  severity: z.string().nullish(),
  modality: z.array(z.string()).nullish(),
  productsAffected: z.string().nullish(), // syngo.plaza VB30E\nAll versions < VB30E_HF07\naffected by CVE-2024-52334
  version: z.string().nullish(),
  activationDate: z.string().nullish(),
  lastUpdated: z.string().nullish(),
  active: z.boolean().nullish(),
  enableMail: z.boolean().nullish(), // for subscriber mailing, probably don't need it
  lastEmailsSent: z.string().nullish(),
});

export type FleetAdvisory = z.infer<typeof fleetAdvisorySchema>;

const fleetAttachmentSchema = z.object({
  name: z.string(),
  type: z.string().nullish(),
  size: z.string().nullish(),
  languageCode: z.string().nullish(),
});

export type FleetAdvisoryAttachment = z.infer<typeof fleetAttachmentSchema>;

const fleetAttachmentsResponseSchema = z.array(fleetAttachmentSchema);
export interface FleetAdvisoryRecord extends FleetAdvisory {
  attachments: FleetAdvisoryAttachment[];
}

export interface FleetAdvisoryItem {
  vendorId: string;
  title: string;
  body: string;
  attachments: FleetAdvisoryAttachment[];
  raw: FleetAdvisoryRecord;
}

export const externalIdOf = (raw: FleetAdvisory): string => String(raw.id);

/**
 * The subset of `raw` that decides whether the advisory actually changed.
 * enableMail and lastEmailsSent are for Fleet's own subscriber, not advisory
 */
const EXCLUDED_FIELDS = [
  "enableMail",
  "lastEmailsSent",
] as const satisfies readonly (keyof FleetAdvisory)[];

export function hashableOf<T extends FleetAdvisory>(
  raw: T,
): Omit<T, (typeof EXCLUDED_FIELDS)[number]> {
  const copy = { ...raw };
  for (const field of EXCLUDED_FIELDS) delete copy[field];
  return copy;
}

export const parseCveIds = (value: string | null | undefined): string[] =>
  value ? value.split(/[,;\s]+/).filter(Boolean) : [];

// For the list of advisories
async function fetchAdvisories(session: Session): Promise<FleetAdvisory[]> {
  const res = await session.request(ADVISORIES_URL);
  if (!res.ok) {
    throw new Error(
      `Fleet / security-advisories/active returned ${res.status}`,
    );
  }
  return z.array(fleetAdvisorySchema).parse(await res.json());
}

// For getting the relevant attachment of specific advisory
export async function fetchAttachments(
  session: Session,
  externalId: string,
): Promise<FleetAdvisoryAttachment[]> {
  try {
    const res = await session.request(advisoryAttachmentsUrl(externalId));
    if (!res.ok) {
      console.warn(
        `Fleet advisory ${externalId} attachments returned ${res.status}`,
      );
      return [];
    }
    const parsed = fleetAttachmentsResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      console.warn(
        `Fleet advisory ${externalId} attachments returned an unexpected shape`,
      );
      return [];
    }
    return parsed.data;
  } catch (err) {
    console.warn(`Fleet advisory ${externalId} attachments failed`, err);
    return [];
  }
}

export async function* listChanged(
  session: Session,
  _cursor: Cursor | null,
): AsyncIterable<Page<FleetAdvisoryRecord>> {
  const all = await fetchAdvisories(session);
  const activeAdvisories = all.filter((a) => a.active !== false);
  const items: FleetAdvisoryRecord[] = [];

  for (const advisory of activeAdvisories) {
    items.push({
      ...advisory,
      attachments: await fetchAttachments(session, String(advisory.id)),
    });
  }
  // No cursor, advisories endpoint cannot paginate
  yield { items, cursor: null };
}

export async function get(
  session: Session,
  externalId: string,
): Promise<FleetAdvisoryRecord> {
  const all = await fetchAdvisories(session);
  const found = all.find((a) => externalIdOf(a) === externalId);
  if (!found) {
    throw new Error(`Fleet has no advisory ${externalId}`);
  }
  return { ...found, attachments: await fetchAttachments(session, externalId) };
}

export function buildAdvisoryBody(advisory: FleetAdvisoryRecord): string {
  const attachments = advisory.attachments;
  const cves = parseCveIds(advisory.cveIds);
  const band = cvssBand(advisory.cvssScore);

  const lines: string[] = [
    `# ${buildText(advisory.title) ?? `Fleet advisory ${advisory.id}`}`,
  ];
  lines.push(
    ...[
      buildRow("Advisory", buildText(advisory.advisoryId)),
      buildRow(
        "CVSS",
        advisory.cvssScore != null
          ? `${advisory.cvssScore}${band ? ` (${band})` : ""}`
          : null,
      ),
      buildRow("Published", buildText(advisory.activationDate)),
      buildRow("Last updated", buildText(advisory.lastUpdated)),
      buildRow("Revision", buildText(advisory.version)),
      buildRow(
        "Modality",
        advisory.modality?.length ? advisory.modality.join(", ") : null,
      ),
    ].filter((line): line is string => line !== null),
    "",
  );
  if (cves.length > 0) {
    lines.push("## Vulnerabilities", "", ...cves.map((cve) => `- ${cve}`), "");
  }
  const products = buildText(advisory.productsAffected);
  if (products) {
    lines.push(
      "## Affected products",
      "",
      ...products
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `- ${line}`),
      "",
    );
  }
  if (attachments.length > 0) {
    lines.push(
      "## Attachments",
      "",
      ...attachments.map((att) => `- ${att.name}`),
      "",
      "The full advisory text is in the attached document.",
      "",
    );
  }
  return lines.join("\n").trim();
}

export function toCanonical(raw: FleetAdvisoryRecord): FleetAdvisoryItem {
  return {
    vendorId: externalIdOf(raw),
    title: buildText(raw.title) ?? `Fleet Advisory ${raw.id}`,
    body: buildAdvisoryBody(raw),
    attachments: raw.attachments,
    raw,
  };
}
