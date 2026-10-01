import "server-only";
import { z } from "zod";
import type { Session } from "../../core/types";
import { MAX_FEED_BYTES, readCapped } from "./session";

export const rolieFeedSchema = z.object({
  feed: z.object({
    entry: z.array(
      z.object({
        id: z.string(),
        updated: z.string(),
        link: z.array(
          z.object({
            rel: z.string(),
            href: z.string(),
          }),
        ),
      }),
    ),
  }),
});

export interface FeedEntry {
  id: string;
  updatedAt: number;
  documentUrl: string;
}

export const fetchFeed = async (
  session: Session,
  url: string,
  tag?: string,
): Promise<{ unchanged: true } | { entries: FeedEntry[]; tag?: string }> => {
  const response = await session.request(
    url,
    tag ? { headers: { "none-match": tag } } : undefined,
  );
  if (response.status === 304) return { unchanged: true };
  if (!response.ok) {
    throw new Error(`feed ${url} returned ${response.status}`);
  }
  const body = await readCapped(response, MAX_FEED_BYTES, `feed ${url}`);
  const parsed = rolieFeedSchema.parse(JSON.parse(body.toString("utf-8")));

  const entries = parsed.feed.entry.flatMap((entry) => {
    const documentUrl = entry.link.find((l) => l.rel === "self")?.href;
    const updatedAt = Date.parse(entry.updated);
    return documentUrl && Number.isFinite(updatedAt)
      ? [{ id: entry.id, updatedAt, documentUrl }]
      : [];
  });
  return { entries, tag: response.headers.get("tag") ?? undefined };
};
