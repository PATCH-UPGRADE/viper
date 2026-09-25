/**
 * Sanitizes a `?next=` value to a same-origin path, or `null`. Resolving it
 * against a throwaway origin catches `//host`, `/\host`, full URLs, and the
 * tab/newline tricks browsers collapse to `//`. Client-safe (no server-only deps).
 */
export function getSafeRedirectPath(
  value: string | null | undefined,
): string | null {
  if (!value?.startsWith("/")) return null;
  try {
    const url = new URL(value, "http://x.invalid");
    return url.origin === "http://x.invalid" ? url.pathname + url.search : null;
  } catch {
    return null;
  }
}

/**
 * Appends `?next=<encoded>` to `path`, using `&` if `path` already has a query
 * string. Returns `path` unchanged when `next` is null.
 */
export function withNextParam(path: string, next: string | null): string {
  if (!next) return path;
  return `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`;
}
