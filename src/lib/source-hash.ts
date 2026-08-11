import { createHash } from "node:crypto";

/**
 * Content hash for `SourceRecord.contentHash`.
 *
 * SourceRecords are append-only and deduplicate on this value: if a freshly
 * fetched snapshot hashes to the same thing as the mapping's newest one, skip
 * the write. The column is NOT NULL, so every create site needs this.
 *
 * The NUL separator keeps `{raw: {a: 1}, markdown: null}` from colliding with a
 * raw payload whose serialization happens to end in the markdown text.
 */
export const sourceContentHash = (
  raw: unknown,
  markdown?: string | null,
): string =>
  createHash("sha256")
    .update(JSON.stringify(raw ?? {}))
    .update("\0")
    .update(markdown ?? "")
    .digest("hex");
