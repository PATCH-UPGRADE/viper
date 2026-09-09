/**
 * Sanitizes a `?next=` value into a same-origin redirect target, or `null`.
 * Requires a single leading `/`, then resolves the value against a throwaway
 * origin and rejects anything that escapes it: full URLs, schemes, `//host`,
 * `/\host`, and control-character tricks like `/\t/host` that browsers collapse
 * to `//`. No server-only deps, so both server and client code can import it.
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
