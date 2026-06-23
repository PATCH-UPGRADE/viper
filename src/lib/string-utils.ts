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

type DeviceGroupDisplay = {
  vendor: string;
  product: string;
  version?: string | null;
  cpes?: { cpe: string }[];
};

/**
 * Human-readable label for a device group, e.g. "Acme InfusionPump".
 * Falls back to "Unknown device" when vendor/product are unknown ("-").
 */
export function deviceGroupLabel(dg: DeviceGroupDisplay): string {
  const parts = [dg.vendor, dg.product].filter((p) => p && p !== "-");
  return parts.length > 0 ? parts.join(" ") : "Unknown device";
}

/** Comma-joined list of a device group's CPE strings. */
export function deviceGroupCpeList(dg: DeviceGroupDisplay): string {
  return dg.cpes?.map((c) => c.cpe).join(", ") ?? "";
}

type MatchObjectDisplay = {
  vendor: string;
  product?: string | null;
  version?: string | null;
  versionRange?: string | null;
};

/**
 * Human-readable label for a match object, e.g. "Acme Radiator 2.1.3" or
 * "Acme Radiator vers:semver/>=2.0|<3.0".
 */
export function matchObjectLabel(mo: MatchObjectDisplay): string {
  const parts = [mo.vendor, mo.product, mo.version ?? mo.versionRange].filter(
    Boolean,
  );
  return parts.join(" ");
}

/** Comma-joined summary of a set of match objects. */
export function matchObjectsSummary(
  matchObjects: MatchObjectDisplay[],
): string {
  return matchObjects.map(matchObjectLabel).join(", ");
}
