import semver from "semver";
import { type Prisma, VersionStatus } from "@/generated/prisma";

// ============================================================================
// VERS version-range support
// ============================================================================
//
// Minimal implementation of the VERS spec (https://github.com/package-url/vers-spec).
// Format: "vers:<scheme>/<constraints>" where constraints are comparators
// joined by "|", e.g. "vers:semver/>=2.1.2|<=2.1.4" or the wildcard "vers:all/*".
//
// We fully support the `semver` scheme via the `semver` npm package. For other
// schemes we fall back to exact string equality of the constraint. Broader
// scheme support can be added later.

type VersConstraint = {
  operator: ">=" | "<=" | ">" | "<" | "=";
  version: string;
};

export type ParsedVers = {
  scheme: string;
  /** true when the range matches everything (e.g. "vers:all/*" or "*"). */
  matchesAll: boolean;
  constraints: VersConstraint[];
};

const OPERATORS = [">=", "<=", ">", "<", "="] as const;

/**
 * Parse a VERS range string. Returns null when the input is not a recognizable
 * VERS expression.
 */
export function parseVers(range: string): ParsedVers | null {
  const trimmed = range.trim();
  if (!trimmed) return null;

  let scheme = "semver";
  let body = trimmed;

  if (trimmed.startsWith("vers:")) {
    const rest = trimmed.slice("vers:".length);
    const slash = rest.indexOf("/");
    if (slash === -1) return null;
    scheme = rest.slice(0, slash).toLowerCase();
    body = rest.slice(slash + 1);
  }

  if (scheme === "all" || body === "*" || body === "") {
    return { scheme, matchesAll: true, constraints: [] };
  }

  const constraints: VersConstraint[] = [];
  for (const piece of body.split("|")) {
    const part = piece.trim();
    if (!part) continue;
    if (part === "*") {
      return { scheme, matchesAll: true, constraints: [] };
    }
    const operator = OPERATORS.find((op) => part.startsWith(op)) ?? "=";
    const version = part.startsWith(operator)
      ? part.slice(operator.length).trim()
      : part.trim();
    constraints.push({ operator, version });
  }

  return { scheme, matchesAll: false, constraints };
}

/**
 * Whether `version` satisfies the given VERS range string. Unknown/unparseable
 * versions never satisfy a non-"all" range.
 */
export function versSatisfies(version: string | null, range: string): boolean {
  const parsed = parseVers(range);
  if (!parsed) return false;
  if (parsed.matchesAll) return true;
  if (!version) return false;

  // semver scheme: use coerced semver comparison so loose versions still work.
  if (parsed.scheme === "semver") {
    const target = semver.coerce(version);
    if (!target) {
      return parsed.constraints.some(
        (c) => c.operator === "=" && c.version === version,
      );
    }
    return parsed.constraints.every((c) => {
      const bound = semver.coerce(c.version);
      if (!bound) return c.version === version;
      switch (c.operator) {
        case ">=":
          return semver.gte(target, bound);
        case "<=":
          return semver.lte(target, bound);
        case ">":
          return semver.gt(target, bound);
        case "<":
          return semver.lt(target, bound);
        default:
          return semver.eq(target, bound);
      }
    });
  }

  // Non-semver schemes: fall back to exact string equality on an "=" constraint.
  return parsed.constraints.some(
    (c) =>
      c.operator === "=" && c.version.toLowerCase() === version.toLowerCase(),
  );
}

// ============================================================================
// Match status + device-group resolution (canonical-id based)
// ============================================================================

export type MatchingLike = {
  vendorId: string;
  productId: string | null;
  versionId: string | null;
  versionRange: string | null;
};

export type DeviceGroupIdentity = {
  id: string;
  vendorId: string | null;
  productId: string | null;
  versionId: string | null;
  // canonical version string, needed for VERS-range checks
  version?: { canonicalName: string } | null;
};

/**
 * Whether a matching applies to a concrete device group. Vendor/product/exact-
 * version comparisons use canonical FK ids; version-range checks use the
 * version's canonical string.
 */
export function matchingAppliesToDeviceGroup(
  matching: MatchingLike,
  deviceGroup: DeviceGroupIdentity,
): boolean {
  if (!deviceGroup.vendorId || matching.vendorId !== deviceGroup.vendorId) {
    return false;
  }

  // Wildcard product (null) matches every product of the vendor.
  if (matching.productId === null) return true;
  if (matching.productId !== deviceGroup.productId) return false;

  // Vendor + product match. Now resolve the version constraint.
  if (matching.versionId !== null) {
    return matching.versionId === deviceGroup.versionId;
  }

  if (matching.versionRange !== null) {
    return versSatisfies(
      deviceGroup.version?.canonicalName ?? null,
      matching.versionRange,
    );
  }

  // No version constraint => product-level match.
  return true;
}

/**
 * Prisma `where` selecting device groups a matching could apply to (vendor +
 * optional product). Version filtering is done in memory via
 * matchingAppliesToDeviceGroup.
 */
export function deviceGroupWhereForMatching(
  matching: MatchingLike,
): Prisma.DeviceGroupWhereInput {
  return {
    vendorId: matching.vendorId,
    ...(matching.productId !== null ? { productId: matching.productId } : {}),
  };
}

/**
 * Prisma `where` selecting device groups whose reversion is still (UNKNOWN or UNSURE)
 */
export function unknownVersionDeviceGroupWhere(
  matching: MatchingLike,
): Prisma.DeviceGroupWhereInput | null {
  if (matching.versionId === null && matching.versionRange === null)
    return null;

  return {
    vendorId: matching.vendorId,
    ...(matching.productId !== null ? { productId: matching.productId } : {}),
    versionStatus: { in: [VersionStatus.UNKNOWN, VersionStatus.UNSURE] },
  };
}

/**
 * Prisma `where` selecting matchings that could apply to a device group: same
 * vendor, and either a wildcard product or the same product (the naive
 * same-vendor/product scan). Caller must pass a group that has a vendorId.
 */
export function matchingWhereForDeviceGroup(deviceGroup: {
  vendorId: string;
  productId: string | null;
}): Prisma.DeviceGroupMatchingWhereInput {
  return {
    vendorId: deviceGroup.vendorId,
    OR: [{ productId: null }, { productId: deviceGroup.productId }],
  };
}

/**
 * Resolve a set of matchings against candidate device groups, returning the
 * groups that any matching applies to (deduped by group id).
 */
export function resolveMatches<T extends DeviceGroupIdentity>(
  matchings: MatchingLike[],
  deviceGroups: T[],
): T[] {
  const matched = new Map<string, T>();

  for (const matching of matchings) {
    for (const deviceGroup of deviceGroups) {
      if (matchingAppliesToDeviceGroup(matching, deviceGroup)) {
        matched.set(deviceGroup.id, deviceGroup);
      }
    }
  }

  return [...matched.values()];
}
