/**
 * Sanitizes a `?next=` value into a same-origin redirect target, or `null`.
 * Rejects anything not starting with a single `/` — full URLs, schemes, and
 * `//` / `/\` (which browsers resolve as protocol-relative). No server-only
 * deps, so both server and client code can import it.
 */
export function getSafeRedirectPath(
  value: string | null | undefined,
): string | null {
  return value?.startsWith("/") && value[1] !== "/" && value[1] !== "\\"
    ? value
    : null;
}
