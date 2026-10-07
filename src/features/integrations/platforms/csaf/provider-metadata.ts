import "server-only";
import { z } from "zod";
import type { Session } from "../../core/types";
import { MAX_DOC_BYTES, readCapped } from "./session";

const feedSchema = z.object({
  url: z.string(),
  summary: z.string().optional(),
  tlp_label: z.string().optional(),
});

export const providerMetadataSchema = z.object({
  canonical_url: z.string().optional(),
  role: z.string().optional(),
  publisher: z.object({ name: z.string(), namespace: z.string().optional() }),
  distributions: z
    .array(
      z.object({
        directory_url: z.string().optional(),
        rolie: z.object({ feeds: z.array(feedSchema) }).optional(),
      }),
    )
    .default([]),
  public_openpgp_keys: z
    .array(
      z.object({
        fingerprint: z.string().optional(),
        url: z.string().optional(),
      }),
    )
    .default([]),
});

export type ProviderMetadata = z.infer<typeof providerMetadataSchema>;
export type Feed = z.infer<typeof feedSchema>;

export const fetchProviderMetadata = async (
  session: Session,
  url: string,
): Promise<ProviderMetadata> => {
  const response = await session.request(url);
  if (!response.ok) {
    throw new Error(`provider metadata ${url} returned ${response.status}`);
  }
  const body = await readCapped(
    response,
    MAX_DOC_BYTES,
    `provider metadata ${url}`,
  );
  return providerMetadataSchema.parse(JSON.parse(body.toString("utf-8")));
};

// rolie feeds in provider-metadata.json
export const feedsOf = (metadata: ProviderMetadata): Feed[] => {
  const feeds = metadata.distributions.flatMap((d) => d.rolie?.feeds ?? []);
  if (feeds.length === 0) {
    throw new Error("This provider advertises no ROLIE feeds");
  }
  return feeds;
};
