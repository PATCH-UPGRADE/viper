import { createHash } from "node:crypto";

/**
 * Rebuild plain objects with their keys in sorted order so `JSON.stringify`
 * produces the same bytes regardless of insertion order. Raw payloads come off
 * the wire (email webhooks, partner submissions), where key order is whatever
 * the sender serialized — without this, a replay of an identical payload can
 * hash differently and defeat the dedup below.
 *
 * Arrays keep their order: element position is meaningful, key order is not.
 */
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  // Dates, null, and class instances serialize via their own toJSON/valueOf.
  if (value === null || typeof value !== "object") return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;

  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [
        key,
        canonicalize((value as Record<string, unknown>)[key]),
      ]),
  );
};

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
    .update(JSON.stringify(canonicalize(raw ?? {})))
    .update("\0")
    .update(markdown ?? "")
    .digest("hex");
