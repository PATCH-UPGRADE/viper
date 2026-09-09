/**
 * Turns a `?next=` value into a same-origin path, or `null`. Resolving against a
 * throwaway origin rejects anything that escapes it — full URLs, `//host`,
 * `/\host`, and tab/newline tricks browsers collapse to `//`. No server-only
 * deps, so client and server can both import it.
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
