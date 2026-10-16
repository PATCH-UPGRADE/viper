// biome-ignore-all lint/suspicious/noExplicitAny: "any" allows us to reuse prisma client/models accross multiple files
import "server-only";
import { TRPCError } from "@trpc/server";
import {
  type ArtifactType,
  type Prisma,
  type ResourceType,
  VersionStatus,
  type VersScheme,
} from "@/generated/prisma";
import prisma, { type TransactionClient } from "@/lib/db";
import { requireExistence } from "@/trpc/middleware";
import {
  assetWhereForMatching,
  type DeviceIdentity,
  deviceIdentitySelect,
  deviceKey,
  type MatchingLike,
  matchingAppliesToDevice,
  matchingWhereForDevice,
  strictAssetWhereForMatching,
  versSatisfies,
} from "./device-matching";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  type PaginationInput,
} from "./pagination";
import { consumeUserToken } from "./tokens";

// ============================================================================
// SORTING
// ============================================================================

/**
 * Build a parser that turns the DataTable's `?sort=` URL param into a Prisma
 * `orderBy` array. The DataTable serializes sorting state as
 * `field` or `-field` (descending), comma-separated for multi-column sort.
 *
 * Unknown fields are silently dropped so callers don't blindly forward user
 * input to Prisma. The default is used when the param is empty OR when every
 * requested field is rejected by the whitelist.
 */
export function createSortParser<Field extends string>(
  allowedFields: ReadonlySet<Field>,
  defaultOrder: Array<Partial<Record<Field, "asc" | "desc">>>,
) {
  return (raw: string): Array<Partial<Record<Field, "asc" | "desc">>> => {
    if (!raw) return defaultOrder;
    const parsed: Array<Partial<Record<Field, "asc" | "desc">>> = [];
    for (const part of raw.split(",")) {
      const desc = part.startsWith("-");
      const field = (desc ? part.slice(1) : part) as Field;
      if (allowedFields.has(field)) {
        parsed.push({ [field]: desc ? "desc" : "asc" } as Partial<
          Record<Field, "asc" | "desc">
        >);
      }
    }
    return parsed.length > 0 ? parsed : defaultOrder;
  };
}

// ============================================================================
// PRISMA TYPES
// ============================================================================

// so we can take in `prisma` into functions and work with it
type PrismaDelegate<T = any> = {
  count: (args?: any) => Promise<number | any>;
  findFirst: (args?: any) => Promise<T | null>;
  findMany: (args?: any) => Promise<T[]>;
  create: (args: any) => Promise<T>;
  update: (args: any) => Promise<T>;
  upsert: (args: any) => Promise<T>;
};

// ============================================================================
// List / Detail view helpers
// ============================================================================

// ============================================================================
// Canonical Manufacturer / Product / Version resolution
// ============================================================================

// Normalize a name for canonical lookup (the displayName keeps the original).
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// exact canonical-name or alias match for Manufacturer/Product lookups
export function canonicalNameWhere(name: string) {
  const canonicalName = normalizeName(name);
  return {
    OR: [{ canonicalName }, { nameMappings: { has: canonicalName } }],
  };
}

// Loose name search for Manufacturer/Product (substring on either name, or exact alias)
export const nameOrClauses = (term: string) => [
  { canonicalName: { contains: term, mode: "insensitive" as const } },
  { canonicalDisplayName: { contains: term, mode: "insensitive" as const } },
  { nameMappings: { has: normalizeName(term) } },
];

// A lost create-race surfaces as a P2002 unique violation; the row now exists.
// Duck-typed on `code` rather than `instanceof PrismaClientKnownRequestError`:
// across Next.js module boundaries the thrown error can be a different copy of
// the class, so `instanceof` is unreliable.
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Find-or-create the canonical Manufacturer for a name. Matches an existing row by
 * canonicalName or by membership in its nameMappings (aliases).
 *
 * Canonicals are an idempotent shared registry, so this runs on the autocommit
 * client (never inside the caller's transaction): a concurrent create losing the
 * unique race throws P2002, which would poison an enclosing interactive
 * transaction. Instead we catch P2002 and re-read the winner's row.
 */
export async function resolveManufacturer(name: string) {
  const canonicalName = normalizeName(name);
  const find = () =>
    prisma.manufacturer.findFirst({
      where: canonicalNameWhere(name),
    });
  const existing = await find();
  if (existing) return existing;
  try {
    return await prisma.manufacturer.create({
      data: { canonicalName, canonicalDisplayName: name },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const row = await find();
      if (row) return row;
    }
    throw error;
  }
}

/**
 * Find-or-create the canonical Vendor for a name. Matches an existing row by
 * canonicalName only
 */
export async function resolveVendor(
  name: string,
  opts: { manufacturerId?: string } = {},
) {
  const canonicalName = normalizeName(name);
  const find = () => prisma.vendor.findUnique({ where: { canonicalName } });
  const existing = await find();
  if (existing) {
    if (opts.manufacturerId && !existing.manufacturerId) {
      return prisma.vendor.update({
        where: { id: existing.id },
        data: { manufacturerId: opts.manufacturerId },
      });
    }
    return existing;
  }

  try {
    return await prisma.vendor.create({
      data: {
        canonicalName,
        canonicalDisplayName: name,
        manufacturerId: opts.manufacturerId ?? null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const row = await find();
      if (row) return row;
    }
    throw error;
  }
}

/** Find-or-create a Product by name or alias, inside its manufacturer. */
export async function resolveProduct(name: string, manufacturerId: string) {
  const canonicalName = normalizeName(name);
  const find = () =>
    prisma.product.findFirst({
      where: { manufacturerId, ...canonicalNameWhere(name) },
    });
  const existing = await find();
  if (existing) return existing;
  try {
    return await prisma.product.create({
      data: { manufacturerId, canonicalName, canonicalDisplayName: name },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const row = await find();
      if (row) return row;
    }
    throw error;
  }
}

/** Find-or-create a Version by name, inside its product. */
export async function resolveVersion(
  name: string,
  productId: string,
  opts: { versScheme?: VersScheme | null } = {},
) {
  const canonicalName = normalizeName(name);
  const find = () =>
    prisma.version.findFirst({ where: { productId, canonicalName } });
  const existing = await find();
  if (existing) return existing;
  try {
    return await prisma.version.create({
      data: {
        productId,
        canonicalName,
        canonicalDisplayName: name,
        versScheme: opts.versScheme ?? undefined,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const row = await find();
      if (row) return row;
    }
    throw error;
  }
}

// ============================================================================
// Device resolution
// ============================================================================

export interface DeviceIdentityInput {
  manufacturer: string;
  product?: string | null;
  version?: string | null;
  versionStatus?: VersionStatus;
  versScheme?: VersScheme | null;
  udi?: string | null;
}

/** The canonical ids and version status that an asset stores. */
export type ResolvedDevice = {
  manufacturerId: string;
  productId: string | null;
  versionId: string | null;
  versionStatus: VersionStatus;
};

/**
 * Resolve each part of a manufacturer/product/version identity to its canonical
 * row, and return the ids to write on an asset. A version resolves only under a
 * product. A UDI fills the version's udiDi when it has none.
 *
 * Canonicals are resolved on the autocommit client so a lost canonical race
 * never poisons an enclosing transaction.
 */
export async function resolveDevice(
  identity: DeviceIdentityInput,
): Promise<ResolvedDevice> {
  const {
    manufacturer,
    product = null,
    version = null,
    versionStatus,
    versScheme = null,
    udi,
  } = identity;

  const manufacturerRow = await resolveManufacturer(manufacturer);
  const productRow = product
    ? await resolveProduct(product, manufacturerRow.id)
    : null;
  const versionRow =
    productRow && version
      ? await resolveVersion(version, productRow.id, { versScheme })
      : null;

  if (versionRow && udi && !versionRow.udiDi) {
    await fillVersionUdi({ id: versionRow.id }, udi);
  }

  return {
    manufacturerId: manufacturerRow.id,
    productId: productRow?.id ?? null,
    versionId: versionRow?.id ?? null,
    versionStatus:
      versionStatus ??
      (versionRow ? VersionStatus.KNOWN : VersionStatus.UNKNOWN),
  };
}

/**
 * Sets the UDI-DI of the version that `where` selects, if it has none. udiDi is
 * unique: when another version already holds this UDI, that version keeps it.
 */
export async function fillVersionUdi(
  where: Prisma.VersionWhereInput & { id: string },
  udi: string,
): Promise<void> {
  try {
    await prisma.version.updateMany({
      where: { ...where, udiDi: null },
      data: { udiDi: udi },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
}

const CPE_UNKNOWN_TOKENS = new Set(["", "-", "*"]);

/** The manufacturer and product name that parseCpe gives an unknown token. */
export const UNKNOWN_CPE_NAME = "-";

/**
 * Map a CPE 2.3 version token to an asset `versionStatus`:
 * - "-"        => NOT_APPLICABLE (the CPE's NA marker)
 * - "*"/empty  => UNKNOWN        (the CPE's ANY marker / unspecified)
 * - any value  => KNOWN
 */
function cpeVersionStatus(versionRaw: string): VersionStatus {
  if (versionRaw === "-") return VersionStatus.NOT_APPLICABLE;
  if (versionRaw === "" || versionRaw === "*") return VersionStatus.UNKNOWN;
  return VersionStatus.KNOWN;
}

/**
 * Parse a CPE 2.3 string into a manufacturer/product/version identity.
 * Format: cpe:2.3:<part>:<vendor>:<product>:<version>:...
 * Unknown tokens ("-", "*", empty) map to "-" for manufacturer/product and null for
 * version; `versionStatus` preserves the NA-vs-ANY distinction for the version.
 */
export function parseCpe(cpe: string): {
  manufacturer: string;
  product: string;
  version: string | null;
  versionStatus: VersionStatus;
} {
  const parts = cpe.split(":");
  const manufacturerRaw = parts[3] ?? UNKNOWN_CPE_NAME;
  const productRaw = parts[4] ?? UNKNOWN_CPE_NAME;
  const versionRaw = parts[5] ?? "";
  const norm = (value: string, fallback: string) =>
    CPE_UNKNOWN_TOKENS.has(value) ? fallback : value;
  return {
    manufacturer: norm(manufacturerRaw, UNKNOWN_CPE_NAME),
    product: norm(productRaw, UNKNOWN_CPE_NAME),
    version: CPE_UNKNOWN_TOKENS.has(versionRaw) ? null : versionRaw,
    versionStatus: cpeVersionStatus(versionRaw),
  };
}

/**
 * Resolve the device ids for a CPE string. A `version` replaces the CPE's
 * version and makes the status KNOWN. A `versionStatus` replaces the status
 * that the CPE implies.
 */
export async function cpeToDevice(
  cpe: string,
  overrides: { version?: string; versionStatus?: VersionStatus } = {},
) {
  const parsed = parseCpe(cpe);
  return resolveDevice({
    ...parsed,
    version: overrides.version ?? parsed.version,
    versionStatus: overrides.version
      ? VersionStatus.KNOWN
      : (overrides.versionStatus ?? parsed.versionStatus),
  });
}

// ============================================================================
// DeviceGroupMatching resolution + matching queries
// ============================================================================

type MatchingResolveInput = {
  manufacturer: string;
  product?: string | null;
  version?: string | null;
  versionRange?: string | null;
};

/**
 * Find-or-create a shared DeviceGroupMatching for a manufacturer/product/version
 * identity (resolved to canonical rows).
 *
 * The identity is unique (device_group_matching_identity_key), so a concurrent
 * create that loses the race throws P2002; we re-read the winner's row. Runs on
 * the autocommit client for the same reason as resolveManufacturer.
 */
export async function resolveMatchingId(
  input: MatchingResolveInput,
): Promise<string> {
  const manufacturerRow = await resolveManufacturer(input.manufacturer);
  const productRow = input.product
    ? await resolveProduct(input.product, manufacturerRow.id)
    : null;
  // A version belongs to a product. A matching with no product already applies
  // to every product and version of the manufacturer, so it stores no version.
  const versionRow =
    productRow && input.version
      ? await resolveVersion(input.version, productRow.id)
      : null;

  const where = {
    manufacturerId: manufacturerRow.id,
    productId: productRow?.id ?? null,
    versionId: versionRow?.id ?? null,
    versionRange: input.versionRange ?? null,
  };

  const find = () => prisma.deviceGroupMatching.findFirst({ where });
  const existing = await find();
  if (existing) return existing.id;

  try {
    const created = await prisma.deviceGroupMatching.create({ data: where });
    return created.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const row = await find();
      if (row) return row.id;
    }
    throw error;
  }
}

/**
 * Resolve a CPE string to a single shared DeviceGroupMatching id (the "identity"
 * of a device artifact — the device it emulates/describes).
 */
export async function resolveMatchingIdFromCpe(cpe: string): Promise<string> {
  const { manufacturer, product, version } = parseCpe(cpe);
  return resolveMatchingId({ manufacturer, product, version });
}

/**
 * Resolve a list of CPE strings to shared DeviceGroupMatching rows and return a
 * Prisma `connect` array. This is how the CPE-based upload endpoints
 * connect vulnerabilities/remediations to devices without exposing the
 * match-object input shape.
 */
export async function cpesToMatchingConnect(cpes: string[]) {
  const ids = await Promise.all(
    [...new Set(cpes)].map(resolveMatchingIdFromCpe),
  );
  return [...new Set(ids)].map((id) => ({ id }));
}

/**
 * Find the vulnerabilities whose matchings apply to any of the given devices.
 * Naive scan: only matchings sharing the device's manufacturer (+product or
 * wildcard) are loaded, then confirmed in memory (handles version + VERS ranges).
 */
export async function findVulnerabilitiesMatchingDevices(
  devices: DeviceIdentity[],
) {
  // Many assets share one device, so match each distinct device once.
  const known = [
    ...new Map(
      devices
        .filter(
          (d): d is DeviceIdentity & { manufacturerId: string } =>
            d.manufacturerId !== null,
        )
        .map((d) => [deviceKey(d), d]),
    ).values(),
  ];
  if (known.length === 0) return [];

  const matchings = await prisma.deviceGroupMatching.findMany({
    where: {
      OR: known.map((d) =>
        matchingWhereForDevice({
          manufacturerId: d.manufacturerId,
          productId: d.productId,
        }),
      ),
    },
    include: { vulnerabilities: true },
  });

  const vulns = new Map<
    string,
    (typeof matchings)[number]["vulnerabilities"][number]
  >();
  for (const matching of matchings) {
    if (known.some((device) => matchingAppliesToDevice(matching, device))) {
      for (const vuln of matching.vulnerabilities) vulns.set(vuln.id, vuln);
    }
  }
  return [...vulns.values()];
}

const matchingIdentitySelect = {
  id: true,
  manufacturerId: true,
  productId: true,
  versionId: true,
  versionRange: true,
  version: { select: { canonicalName: true } },
} as const;

// Whether a matching's identity applies to a device. Exact/range version
// matching when the device's version is known; for an unknown-version device we
// fall back to manufacturer (+product) — per the spec's "same manufacturer/product" rule.
function identityAppliesToDevice(
  matching: MatchingLike,
  device: DeviceIdentity,
): boolean {
  if (matchingAppliesToDevice(matching, device)) return true;
  if (
    device.versionId === null &&
    device.manufacturerId === matching.manufacturerId
  ) {
    return (
      matching.productId === null || matching.productId === device.productId
    );
  }
  return false;
}

/**
 * Find the ids of DeviceGroupMatchings that apply to the given device
 * (same manufacturer/product, with version exact/range, or manufacturer/product fallback
 * for an unknown-version device). Used to list a device's artifacts and to
 * identify which of an artifact's matchings represent the device itself.
 */
export async function findMatchingIdsForDevice(
  device: DeviceIdentity,
): Promise<string[]> {
  if (!device.manufacturerId) return [];
  const candidates = await prisma.deviceGroupMatching.findMany({
    where: matchingWhereForDevice({
      manufacturerId: device.manufacturerId,
      productId: device.productId,
    }),
    select: matchingIdentitySelect,
  });
  return candidates
    .filter((matching) => identityAppliesToDevice(matching, device))
    .map((matching) => matching.id);
}

/**
 * Inverse of {@link findMatchingIdsForDevice}: resolve a set of device-group
 * matchings to the ids of the assets they apply to. Coarse manufacturer/product
 * DB filter, then the in-memory check (identityAppliesToDevice: VERS ranges, and
 * the manufacturer/product fallback for an unknown-version asset).
 */
export async function findAssetIdsForMatchings(
  matchings: MatchingLike[],
): Promise<string[]> {
  if (matchings.length === 0) return [];
  const candidates = await prisma.asset.findMany({
    where: { OR: matchings.map(assetWhereForMatching) },
    select: deviceIdentitySelect,
  });
  return candidates
    .filter((asset) => matchings.some((m) => identityAppliesToDevice(m, asset)))
    .map((asset) => asset.id);
}

/**
 * How many assets a matching resolves to, by matchingAppliesToDevice.
 * Notifications call this once per matching per row, so it never loads one row
 * per asset: only a product's VERS range needs the versions, counted by version.
 */
export async function resolvedAssetCount(
  matching: MatchingLike,
): Promise<number> {
  const { versionRange } = matching;
  const needsRangeCheck =
    matching.productId !== null &&
    matching.versionId === null &&
    versionRange !== null;
  if (!needsRangeCheck) {
    return prisma.asset.count({ where: strictAssetWhereForMatching(matching) });
  }

  const byVersion = await prisma.asset.groupBy({
    by: ["versionId"],
    where: assetWhereForMatching(matching),
    _count: { _all: true },
  });
  const versionIds = byVersion.flatMap((g) =>
    g.versionId ? [g.versionId] : [],
  );
  const versions = await prisma.version.findMany({
    where: { id: { in: versionIds } },
    select: { id: true, canonicalName: true },
  });
  const versionName = new Map(versions.map((v) => [v.id, v.canonicalName]));
  return byVersion
    .filter((g) =>
      versSatisfies(
        g.versionId ? (versionName.get(g.versionId) ?? null) : null,
        versionRange,
      ),
    )
    .reduce((sum, g) => sum + g._count._all, 0);
}

export async function fetchPaginated<
  TDelegate extends Pick<PrismaDelegate, "count" | "findMany">,
  TArgs extends Parameters<TDelegate["findMany"]>[0],
>(
  delegate: TDelegate,
  input: PaginationInput,
  args: Omit<TArgs, "skip" | "take">,
) {
  const updatedAtFilter: Record<string, Date> = {};
  if (input.lastUpdatedStartTime) {
    updatedAtFilter.gte = new Date(input.lastUpdatedStartTime);
  }
  if (input.lastUpdatedEndTime) {
    updatedAtFilter.lte = new Date(input.lastUpdatedEndTime);
  }

  const where = {
    ...args.where,
    ...(Object.keys(updatedAtFilter).length > 0 && {
      updatedAt: updatedAtFilter,
    }),
  };

  const totalCount = await delegate.count({ where });

  const meta = buildPaginationMeta(input, totalCount);

  const items = await delegate.findMany({
    orderBy: { createdAt: "desc" },
    ...args,
    where,
    skip: meta.skip,
    take: meta.take,
  } as TArgs);

  return createPaginatedResponse(items, meta);
}

// Helper function to transform Prisma result to response format
export const transformArtifactWrapper = (item: any) => {
  return {
    ...item,
    artifacts: item.artifacts
      .map((wrapper: any) => {
        const { _count: _ignoreMe, ...rest } = wrapper;
        return {
          ...rest,
          versionsCount: wrapper._count.artifacts,
        };
      })
      .filter(Boolean),
  };
};

export type ArtifactWrapperParentFieldOptions =
  | "deviceArtifactId"
  | "remediationId";

// Helper function to create ArtifactWrappers
export async function createArtifactWrappers(
  tx: TransactionClient,
  artifacts: Array<{
    name?: string | null;
    artifactType: ArtifactType;
    downloadUrl?: string | null;
    size?: number | null;
    hash?: string | null;
  }>,
  parentId: string,
  parentField: ArtifactWrapperParentFieldOptions,
  userId: string,
): Promise<void> {
  for (const artifactInput of artifacts) {
    // Create artifact wrapper
    const wrapper = await tx.artifactWrapper.create({
      data: {
        [parentField]: parentId,
        userId,
      },
    });

    // Create initial artifact
    const artifact = await tx.artifact.create({
      data: {
        wrapperId: wrapper.id,
        name: artifactInput.name || null,
        artifactType: artifactInput.artifactType,
        downloadUrl: artifactInput.downloadUrl,
        size: artifactInput.size || null,
        hash: artifactInput.hash || null,
        versionNumber: 1,
        userId,
      },
    });

    // Update wrapper to point to this artifact as latest
    await tx.artifactWrapper.update({
      where: { id: wrapper.id },
      data: { latestArtifactId: artifact.id },
    });
  }
}

// ============================================================================
// INTEGRATION SYNC
// ============================================================================

/**
 * Helper: return a userId and the associated integration, or throw an error
 * if invalid
 */
export const processIntegrationToken = async (
  token: string,
  expectedPermissions: ResourceType,
) => {
  const userId = await consumeUserToken(token, expectedPermissions);
  // TODO: probably need better error messages than this tbh
  if (!userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Invalid token (couldn't find it, expired, or invalid permissions)`,
    });
  }
  const integration = await prisma.integration.findUnique({
    where: { integrationUserId: userId },
    select: { id: true },
  });
  const integrationId = requireExistence(integration, "Integration").id;
  return { userId, integrationId, resource: expectedPermissions };
};
