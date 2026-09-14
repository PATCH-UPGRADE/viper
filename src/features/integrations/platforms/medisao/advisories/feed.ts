import { z } from "zod";
import type { Tlp } from "@/generated/prisma";
import type { Session } from "../../../core/types";
import { walkPages, withSince } from "../paginate";
import { parseTlp } from "../tlp";
import { channelAdvisoriesUrl } from "../urls";
import { splitVersion } from "../version";

/**
 * One advisory as MedISAO sends it.
 *
 * Only what the ingest depends on is required. The rest is nullish, because the
 * dev instance carries a single hand-made record whose nulls prove nothing
 * about production. Unknown keys are stripped, so a field they add later cannot
 * fail the parse.
 */
export const rawAdvisorySchema = z.object({
  id: z.string(),
  channel: z.object({
    vendor: z.string(),
    product: z.string().nullish(),
  }),
  name: z.string().nullish(),
  description: z.string().nullish(),
  version: z.string().nullish(),
  version_text: z.string().nullish(),
  tlp: z.string().nullish(),
  linked_vulnerabilities: z.array(z.string()).nullish(),
  source_type: z.string().nullish(),
  url: z.string().nullish(),
  published_at: z.string().nullish(),
  updated_at: z.string(),
});
export type RawMedIsaoAdvisory = z.infer<typeof rawAdvisorySchema>;

export interface MedIsaoAdvisoryItem {
  externalId: string;
  upstreamApi: string;
  /** MedISAO publishes no page of its own, so this is the vendor's link if any. */
  webUrl: string | null;

  manufacturer: string;
  product: string | null;
  version: string | null;
  versionRange: string | null;

  title: string;
  /** What every downstream agent reads. */
  markdown: string;
  vulnerabilityIds: string[];
  /** Stated by MedISAO, so it is never left to the classifier to infer. */
  tlp: Tlp | undefined;

  updatedAt: string;
  raw: RawMedIsaoAdvisory;
}

/** The agents read one markdown body, so the title and prose are joined into one. */
export const toMarkdown = (raw: RawMedIsaoAdvisory): string => {
  const parts: string[] = [];
  if (raw.name) parts.push(`# ${raw.name}`);
  if (raw.description) parts.push(raw.description);
  if (raw.version_text) parts.push(`Affected versions: ${raw.version_text}`);
  if (raw.linked_vulnerabilities?.length) {
    parts.push(
      `Referenced vulnerabilities: ${raw.linked_vulnerabilities.join(", ")}`,
    );
  }
  if (raw.url) parts.push(`Source: ${raw.url}`);
  return parts.join("\n\n");
};

export const toCanonical = (
  raw: RawMedIsaoAdvisory,
  apiUrl: string,
  channelId: string,
): MedIsaoAdvisoryItem => ({
  externalId: raw.id,
  upstreamApi: channelAdvisoriesUrl(apiUrl, channelId),
  // The live feed sends "" for an advisory with no page of its own.
  webUrl: raw.url?.trim() ? raw.url : null,

  manufacturer: raw.channel.vendor,
  product: raw.channel.product ?? null,
  ...splitVersion(raw.version),

  title: raw.name?.trim() || `MedISAO advisory ${raw.id}`,
  markdown: toMarkdown(raw),
  vulnerabilityIds: raw.linked_vulnerabilities ?? [],
  tlp: parseTlp(raw.tlp),

  updatedAt: raw.updated_at,
  raw,
});

/** Every advisory on one channel that changed at or after `since`. */
export async function* listChanged(
  session: Session,
  apiUrl: string,
  channelId: string,
  since: Date | null,
): AsyncGenerator<MedIsaoAdvisoryItem[]> {
  const url = withSince(channelAdvisoriesUrl(apiUrl, channelId), since);
  for await (const page of walkPages(session, url, rawAdvisorySchema)) {
    yield page.map((raw) => toCanonical(raw, apiUrl, channelId));
  }
}
