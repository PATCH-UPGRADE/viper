// Shared primitives for the db-item → markdown renderers.

/** A canonical (vendor/product/version) reference as selected for rendering. */
export type CanonicalRef = { canonicalDisplayName: string } | null | undefined;

/** First 8 chars of an id, for compact human-facing references. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Truncate free text to `max` chars, appending an ellipsis when clipped. */
export function truncate(text: string | null | undefined, max = 400): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
