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

/**
 * Markdown block for a canonical device group, e.g.
 * ```
 * ### Acme InfusionPump (2.1.3)
 * - **CPE**: cpe:2.3:...
 * ```
 * Used by the chat/recommendations renderers and the VEX sorting agent so a
 * device group is described consistently wherever it appears.
 */
export function deviceGroupToMarkdown(dg: DeviceGroupDisplay): string {
  const version = displayName(dg.version);
  const heading = `### ${deviceGroupLabel(dg)}${version ? ` (${version})` : ""}`;
  const cpe = deviceGroupCpeList(dg);
  return cpe ? `${heading}\n- **CPE**: ${cpe}` : heading;
}

/**
 * Inline identifier line for a loosely-typed device (CPE + manufacturer + model
 * + version), e.g. "cpe=… | manufacturer=Acme | modelName=Pump | version=2.1".
 * Shared by the notification matching agent for both the extracted device and
 * its search candidates. Missing fields render as "?".
 */
export function deviceIdentityInline(fields: {
  cpe?: string[] | string | null;
  manufacturer?: string | null;
  modelName?: string | null;
  version?: string | null;
}): string {
  const cpe = Array.isArray(fields.cpe)
    ? fields.cpe.join(", ") || "(none)"
    : (fields.cpe ?? "?");
  return `cpe=${cpe} | manufacturer=${fields.manufacturer ?? "?"} | modelName=${fields.modelName ?? "?"} | version=${fields.version ?? "?"}`;
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

/**
 * Human-readable location string from a JSON location value, e.g.
 * "Main Campus / Tower A / Floor 3 / Room 204". Returns "—" when empty
 * or not an object.
 */
export function parseLocation(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "—";
  const loc = raw as {
    facility?: string;
    building?: string;
    floor?: string;
    room?: string;
  };
  return (
    [
      loc.facility,
      loc.building,
      loc.floor ? `Floor ${loc.floor}` : undefined,
      loc.room,
    ]
      .filter(Boolean)
      .join(" / ") || "—"
  );
}
