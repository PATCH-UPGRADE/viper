import semver from "semver";
import type { DeviceGroup, Prisma } from "@/generated/prisma";
import type { DGMatchStatus } from "./schemas";

// ============================================================================
// VERS version-range support
// ============================================================================
//
// Minimal implementation of the VERS spec (https://github.com/package-url/vers-spec).
// Format: "vers:<scheme>/<constraints>" where constraints are comparators
// joined by "|", e.g. "vers:semver/>=2.1.2|<=2.1.4" or the wildcard "vers:all/*".
//
// We fully support the `semver` scheme via the `semver` npm package. For other
// schemes (component versions that are not semver) we fall back to exact string
// equality of the constraint. Broader scheme support can be added later.

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
    (c) => c.operator === "=" && c.version === version,
  );
}

// ============================================================================
// Match status + device-group resolution
// ============================================================================

type MatchObjectLike = {
  vendor: string;
  product?: string | null;
  version?: string | null;
  versionRange?: string | null;
};

type DeviceGroupIdentity = Pick<DeviceGroup, "vendor" | "product" | "version">;

const eqInsensitive = (a: string | null, b: string | null) =>
  (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

/**
 * Compute how confidently a match object matches a concrete device group.
 * Returns null when the match object does not apply to the group at all.
 */
export function computeMatchStatus(
  matchObject: MatchObjectLike,
  deviceGroup: DeviceGroupIdentity,
): DGMatchStatus | null {
  if (!eqInsensitive(matchObject.vendor, deviceGroup.vendor)) return null;

  // Vendor-only match object: matches every product/version of this vendor.
  if (!matchObject.product) return "VENDOR";
  if (!eqInsensitive(matchObject.product, deviceGroup.product)) return null;

  // Vendor + product match object, no version constraint.
  if (!matchObject.version && !matchObject.versionRange) return "PRODUCT";

  if (matchObject.version) {
    return eqInsensitive(matchObject.version, deviceGroup.version)
      ? "VERSION"
      : null;
  }

  // versionRange
  if (matchObject.versionRange) {
    return versSatisfies(deviceGroup.version, matchObject.versionRange)
      ? "VERSION_RANGE"
      : null;
  }

  return "PRODUCT";
}

/**
 * Build a Prisma `where` filter selecting the device groups that a single match
 * object could apply to (vendor + optional product). Version filtering is done
 * in memory via computeMatchStatus because VERS ranges can't be expressed in SQL.
 */
export function matchObjectWhere(
  matchObject: MatchObjectLike,
): Prisma.DeviceGroupWhereInput {
  const where: Prisma.DeviceGroupWhereInput = {
    vendor: { equals: matchObject.vendor, mode: "insensitive" },
  };
  if (matchObject.product) {
    where.product = { equals: matchObject.product, mode: "insensitive" };
  }
  return where;
}

export type MatchedDeviceGroup<T extends DeviceGroupIdentity> = {
  deviceGroup: T;
  matchStatus: DGMatchStatus;
};

/**
 * Given a set of match objects and a candidate list of device groups, return the
 * groups each match object resolves to alongside the computed match status.
 * Deduplicates by device-group id, keeping the strongest match status.
 */
export function resolveMatches<T extends DeviceGroupIdentity & { id: string }>(
  matchObjects: MatchObjectLike[],
  deviceGroups: T[],
): MatchedDeviceGroup<T>[] {
  const strength: Record<DGMatchStatus, number> = {
    VENDOR: 0,
    PRODUCT: 1,
    VERSION_RANGE: 2,
    VERSION: 3,
  };
  const best = new Map<string, MatchedDeviceGroup<T>>();

  for (const matchObject of matchObjects) {
    for (const deviceGroup of deviceGroups) {
      const matchStatus = computeMatchStatus(matchObject, deviceGroup);
      if (!matchStatus) continue;
      const existing = best.get(deviceGroup.id);
      if (!existing || strength[matchStatus] > strength[existing.matchStatus]) {
        best.set(deviceGroup.id, { deviceGroup, matchStatus });
      }
    }
  }

  return [...best.values()];
}
