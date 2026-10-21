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
// Match status + device resolution (canonical-id based)
// ============================================================================

export type MatchingLike = {
  manufacturerId: string;
  productId: string | null;
  versionId: string | null;
  versionRange: string | null;
};

/** A device's canonical ids. An asset has exactly these fields. */
export type DeviceIdentity = {
  id: string;
  manufacturerId: string | null;
  productId: string | null;
  versionId: string | null;
  // canonical version string, needed for VERS-range checks
  version?: { canonicalName: string } | null;
};

/** Selects a DeviceIdentity from an asset. */
export const deviceIdentitySelect = {
  id: true,
  manufacturerId: true,
  productId: true,
  versionId: true,
  version: { select: { canonicalName: true } },
} as const satisfies Prisma.AssetSelect;

/** One key per manufacturer/product/version, shared by the assets that have it. */
export const deviceKey = (device: Omit<DeviceIdentity, "id">): string =>
  `${device.manufacturerId}:${device.productId}:${device.versionId}`;

/**
 * Whether a matching applies to a concrete device. Manufacturer/product/exact-
 * version comparisons use canonical FK ids; version-range checks use the
 * version's canonical string.
 */
export function matchingAppliesToDevice(
  matching: MatchingLike,
  device: DeviceIdentity,
): boolean {
  if (
    !device.manufacturerId ||
    matching.manufacturerId !== device.manufacturerId
  ) {
    return false;
  }

  // Wildcard product (null) matches every product of the manufacturer.
  if (matching.productId === null) return true;
  if (matching.productId !== device.productId) return false;

  // Manufacturer + product match. Now resolve the version constraint.
  if (matching.versionId !== null) {
    return matching.versionId === device.versionId;
  }

  if (matching.versionRange !== null) {
    return versSatisfies(
      device.version?.canonicalName ?? null,
      matching.versionRange,
    );
  }

  // No version constraint => product-level match.
  return true;
}

/**
 * Prisma `where` selecting assets a matching could apply to (manufacturer +
 * optional product). Version filtering is done in memory via
 * matchingAppliesToDevice.
 */
export function assetWhereForMatching(
  matching: MatchingLike,
): Prisma.AssetWhereInput {
  return {
    manufacturerId: matching.manufacturerId,
    ...(matching.productId !== null ? { productId: matching.productId } : {}),
  };
}

/**
 * Prisma `where` for the assets that matchingAppliesToDevice accepts, as far as
 * SQL can tell. Only a product's VERS range still needs the in-memory check.
 */
export function strictAssetWhereForMatching(
  matching: MatchingLike,
): Prisma.AssetWhereInput {
  const exactVersion =
    matching.productId !== null && matching.versionId !== null;
  return {
    ...assetWhereForMatching(matching),
    ...(exactVersion ? { versionId: matching.versionId } : {}),
  };
}

/**
 * The assets that any matching applies to, by matchingAppliesToDevice: an
 * unknown-version asset does not match a version-constrained rule. `find` runs
 * the query, so each caller picks its select and its client.
 */
export async function findAssetsStrictlyMatching<T extends DeviceIdentity>(
  matchings: MatchingLike[],
  find: (where: Prisma.AssetWhereInput) => Promise<T[]>,
): Promise<T[]> {
  if (matchings.length === 0) return [];
  const candidates = await find({
    OR: matchings.map(strictAssetWhereForMatching),
  });
  return candidates.filter((asset) =>
    matchings.some((matching) => matchingAppliesToDevice(matching, asset)),
  );
}

/**
 * Prisma `where` selecting assets whose version is still UNKNOWN or UNSURE
 */
export function unknownVersionAssetWhere(
  matching: MatchingLike,
): Prisma.AssetWhereInput | null {
  if (matching.versionId === null && matching.versionRange === null)
    return null;

  return {
    manufacturerId: matching.manufacturerId,
    ...(matching.productId !== null ? { productId: matching.productId } : {}),
    versionStatus: { in: [VersionStatus.UNKNOWN, VersionStatus.UNSURE] },
  };
}

/**
 * Prisma `where` selecting matchings that could apply to a device: same
 * manufacturer, and either a wildcard product or the same product (the naive
 * same-manufacturer/product scan). Caller must pass a device that has a manufacturerId.
 */
export function matchingWhereForDevice(device: {
  manufacturerId: string;
  productId: string | null;
}): Prisma.DeviceGroupMatchingWhereInput {
  return {
    manufacturerId: device.manufacturerId,
    OR: [{ productId: null }, { productId: device.productId }],
  };
}

/**
 * Resolve a set of matchings against candidate devices, returning the
 * devices that any matching applies to (deduped by id).
 */
export function resolveMatches<T extends DeviceIdentity>(
  matchings: MatchingLike[],
  devices: T[],
): T[] {
  const matched = new Map<string, T>();

  for (const matching of matchings) {
    for (const device of devices) {
      if (matchingAppliesToDevice(matching, device)) {
        matched.set(device.id, device);
      }
    }
  }

  return [...matched.values()];
}
