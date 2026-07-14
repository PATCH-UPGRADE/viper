import type { CanonicalRef } from "./shared";

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
 */
export function deviceGroupToMarkdown(dg: DeviceGroupDisplay): string {
  const version = displayName(dg.version);
  const heading = `### ${deviceGroupLabel(dg)}${version ? ` (${version})` : ""}`;
  const cpe = deviceGroupCpeList(dg);
  return cpe ? `${heading}\n- **CPE**: ${cpe}` : heading;
}

/** A loosely-typed device identity (as extracted from a notification, etc.). */
export interface DeviceIdentity {
  cpe?: string[] | string | null;
  manufacturer?: string | null;
  modelName?: string | null;
  version?: string | null;
  versionRange?: string | null;
}

/**
 * Inline identifier line for a device identity (CPE + manufacturer + model +
 * version + versionRange), e.g.
 * "cpe=… | manufacturer=Acme | modelName=Pump | version=2.1 | versionRange=?".
 * Missing fields render as "?".
 */
export function deviceIdentityInline(fields: DeviceIdentity): string {
  const cpe = Array.isArray(fields.cpe)
    ? fields.cpe.join(", ") || "(none)"
    : (fields.cpe ?? "?");
  return `cpe=${cpe} | manufacturer=${fields.manufacturer ?? "?"} | modelName=${fields.modelName ?? "?"} | version=${fields.version ?? "?"} | versionRange=${fields.versionRange ?? "?"}`;
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
