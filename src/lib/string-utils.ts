/**
 * Capitalizes the first letter of a string
 *
 * @param str - String to capitalize
 * @returns String with first letter capitalized
 *
 * @example
 * capitalize('hello') // 'Hello'
 * capitalize('WORLD') // 'WORLD'
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Formats a resource/model name for display in error messages
 * Converts to string and capitalizes
 *
 * @param modelName - Model or resource name
 * @returns Formatted resource name
 *
 * @example
 * formatResourceName('asset') // 'Asset'
 * formatResourceName('vulnerability') // 'Vulnerability'
 */
export function formatResourceName(modelName: string | symbol): string {
  return capitalize(String(modelName));
}

type CanonicalRef = { canonicalDisplayName: string } | null | undefined;

const displayName = (ref: CanonicalRef): string | undefined =>
  ref && ref.canonicalDisplayName !== "-"
    ? ref.canonicalDisplayName
    : undefined;

type DeviceGroupDisplay = {
  vendor?: CanonicalRef;
  product?: CanonicalRef;
  version?: CanonicalRef;
  cpe?: string[];
};

/**
 * Human-readable label for a device group, e.g. "Acme InfusionPump".
 * Falls back to "Unknown device" when vendor/product are unknown.
 */
export function deviceGroupLabel(dg: DeviceGroupDisplay): string {
  const parts = [displayName(dg.vendor), displayName(dg.product)].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(" ") : "Unknown device";
}

/** Comma-joined list of a device group's CPE strings. */
export function deviceGroupCpeList(dg: DeviceGroupDisplay): string {
  return (dg.cpe ?? []).join(", ");
}

type DeviceGroupMatchingDisplay = {
  vendor?: CanonicalRef;
  product?: CanonicalRef;
  version?: CanonicalRef;
  versionRange?: string | null;
};

/**
 * Human-readable label for a device-group matching, e.g. "Acme Radiator 2.1.3"
 * or "Acme Radiator vers:semver/>=2.0|<3.0".
 */
export function deviceGroupMatchingLabel(
  m: DeviceGroupMatchingDisplay,
): string {
  const parts = [
    displayName(m.vendor),
    displayName(m.product),
    displayName(m.version) ?? m.versionRange ?? undefined,
  ].filter(Boolean);
  return parts.join(" ");
}

/** Comma-joined summary of a set of device-group matchings. */
export function deviceGroupMatchingsSummary(
  matchings: DeviceGroupMatchingDisplay[],
): string {
  return matchings.map(deviceGroupMatchingLabel).join(", ");
}
