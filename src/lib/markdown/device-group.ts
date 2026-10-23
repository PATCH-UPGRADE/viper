import type { CanonicalRef } from "./shared";

export const displayName = (ref: CanonicalRef): string | undefined =>
  ref && ref.canonicalDisplayName !== "-"
    ? ref.canonicalDisplayName
    : undefined;

type DeviceDisplay = {
  manufacturer?: CanonicalRef;
  product?: CanonicalRef;
  version?: CanonicalRef;
};

/**
 * Human-readable label for a device, e.g. "Acme InfusionPump".
 * Falls back to "Unknown device" when manufacturer/product are unknown.
 */
export function deviceLabel(device: DeviceDisplay): string {
  const parts = [
    displayName(device.manufacturer),
    displayName(device.product),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Unknown device";
}

/** Markdown heading for a device, e.g. "### Acme InfusionPump (2.1.3)". */
export function deviceToMarkdown(device: DeviceDisplay): string {
  const version = displayName(device.version);
  return `### ${deviceLabel(device)}${version ? ` (${version})` : ""}`;
}

/** A loosely-typed device identity (as extracted from a notification, etc.). */
export interface ExtractedDeviceIdentity {
  udi?: string | null;
  manufacturer?: string | null;
  modelName?: string | null;
  version?: string | null;
  versionRange?: string | null;
}

/**
 * Inline identifier line for a device identity (UDI + manufacturer + model +
 * version + versionRange), e.g.
 * "udi=? | manufacturer=Acme | modelName=Pump | version=2.1 | versionRange=?".
 * Missing fields render as "?".
 */
export function deviceIdentityInline(fields: ExtractedDeviceIdentity): string {
  return `udi=${fields.udi ?? "?"} | manufacturer=${fields.manufacturer ?? "?"} | modelName=${fields.modelName ?? "?"} | version=${fields.version ?? "?"} | versionRange=${fields.versionRange ?? "?"}`;
}

type DeviceGroupMatchingDisplay = {
  manufacturer?: CanonicalRef;
  product?: CanonicalRef;
  version?: CanonicalRef;
  versionRange?: string | null;
  versionStatus?: string | null;
};

const VERSION_STATUS_LABELS: Record<string, string> = {
  UNKNOWN: "version unknown",
  NOT_APPLICABLE: "no versions",
};

/** The version part of a matching's label: its version, its range, or its status. */
export function matchingVersionLabel(
  m: DeviceGroupMatchingDisplay,
): string | undefined {
  return (
    displayName(m.version) ??
    m.versionRange ??
    (m.versionStatus ? VERSION_STATUS_LABELS[m.versionStatus] : undefined)
  );
}

/**
 * Human-readable label for a device-group matching, e.g. "Acme Radiator 2.1.3"
 * or "Acme Radiator vers:semver/>=2.0|<3.0".
 */
export interface DeviceGroupMatchingLabelOpts {
  hideVersion?: boolean;
}

export function deviceGroupMatchingLabel(
  m: DeviceGroupMatchingDisplay,
  opts?: DeviceGroupMatchingLabelOpts,
): string {
  const parts = [
    displayName(m.manufacturer),
    displayName(m.product),
    !opts?.hideVersion ? matchingVersionLabel(m) : undefined,
  ].filter(Boolean);
  return parts.join(" ");
}

/** Comma-joined summary of a set of device-group matchings. */
export function deviceGroupMatchingsSummary(
  matchings: DeviceGroupMatchingDisplay[],
): string {
  return matchings.map((d) => deviceGroupMatchingLabel(d)).join(", ");
}
