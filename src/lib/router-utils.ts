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
  deviceKey,
  type MatchingLike,
  matchingAppliesToDevice,
  matchingWhereForDevice,
  parseVers,
  strictAssetWhereForMatching,
  versSatisfies,
} from "./device-matching";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  type PaginationInput,
} from "./pagination";
import type { AssetDeviceInput, DeviceInput } from "./schemas";
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

/** The canonical ids that a device input names. */
export type ResolvedDeviceIds = {
  manufacturerId: string;
  productId: string | null;
  versionId: string | null;
};

/**
 * Resolve a device input to its canonical ids. An unknown id is a 404, and an
 * id under another parent is a 400. A name is found or created inside its
 * parent.
 */
export async function resolveDeviceInput(
  device: DeviceInput | AssetDeviceInput,
): Promise<ResolvedDeviceIds> {
  const version =
    "id" in device.version || "name" in device.version ? device.version : null;
  if (version && !device.product) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "device.version needs device.product.",
    });
  }
  const notUnder = (child: string, parent: string) =>
    new TRPCError({
      code: "BAD_REQUEST",
      message: `The ${child} does not belong to the ${parent}.`,
    });

  const manufacturer =
    "id" in device.manufacturer
      ? requireExistence(
          await prisma.manufacturer.findUnique({
            where: { id: device.manufacturer.id },
            select: { id: true },
          }),
          "Manufacturer",
        )
      : await resolveManufacturer(device.manufacturer.name);

  let productId: string | null = null;
  if (device.product) {
    if ("id" in device.product) {
      const product = requireExistence(
        await prisma.product.findUnique({
          where: { id: device.product.id },
          select: { id: true, manufacturerId: true },
        }),
        "Product",
      );
      if (product.manufacturerId !== manufacturer.id)
        throw notUnder("product", "manufacturer");
      productId = product.id;
    } else {
      productId = (await resolveProduct(device.product.name, manufacturer.id))
        .id;
    }
  }

  let versionId: string | null = null;
  if (version && productId) {
    if ("id" in version) {
      const row = requireExistence(
        await prisma.version.findUnique({
          where: { id: version.id },
          select: { id: true, productId: true },
        }),
        "Version",
      );
      if (row.productId !== productId) throw notUnder("version", "product");
      versionId = row.id;
    } else {
      versionId = (await resolveVersion(version.name, productId)).id;
    }
  }

  return { manufacturerId: manufacturer.id, productId, versionId };
}

/**
 * The device fields to write on an asset. Without a device, the asset has no
 * manufacturer, product, or version.
 */
export async function deviceInputToAsset(
  device: AssetDeviceInput | null | undefined,
) {
  const ids = device
    ? await resolveDeviceInput(device)
    : { manufacturerId: null, productId: null, versionId: null };
  const status =
    device?.version && "status" in device.version
      ? device.version.status
      : undefined;
  return {
    ...ids,
    versionStatus:
      status ?? (ids.versionId ? VersionStatus.KNOWN : VersionStatus.UNKNOWN),
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

  return findOrCreateMatching({
    manufacturerId: manufacturerRow.id,
    productId: productRow?.id ?? null,
    versionId: versionRow?.id ?? null,
    versionRange: input.versionRange ?? null,
  });
}

/**
 * Find-or-create the shared matching for these canonical ids.
 *
 * The identity is unique (device_group_matching_identity_key), so a concurrent
 * create that loses the race throws P2002; we re-read the winner's row. Runs on
 * the autocommit client for the same reason as resolveManufacturer.
 */
async function findOrCreateMatching(where: MatchingLike): Promise<string> {
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
 * Resolve device inputs to their shared matchings and return a Prisma `connect`
 * array.
 */
export async function devicesToMatchingConnect(devices: DeviceInput[]) {
  const ids = await Promise.all(devices.map(resolveMatchingIdForDevice));
  return [...new Set(ids)].map((id) => ({ id }));
}

/** Resolve one device input to its shared matching id. */
export async function resolveMatchingIdForDevice(
  device: DeviceInput,
): Promise<string> {
  return findOrCreateMatching({
    ...(await resolveDeviceInput(device)),
    versionRange: matchingVersionRange(device.version),
  });
}

/**
 * The versionRange to store for a device input. A range that matches every
 * version is stored as no range: that is the same matching that a product-level
 * rule from the inbox has, so the two do not become duplicate rows.
 */
function matchingVersionRange(version: DeviceInput["version"]): string | null {
  if (!("range" in version)) return null;
  const parsed = parseVers(version.range);
  if (!parsed) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid VERS range: ${version.range}`,
    });
  }
  return parsed.matchesAll ? null : version.range;
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
 * The device identity of a version: its product's manufacturer, its product,
 * and the version itself. Null for an unknown id.
 */
export async function findVersionIdentity(
  versionId: string,
): Promise<DeviceIdentity | null> {
  const version = await prisma.version.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      canonicalName: true,
      productId: true,
      product: { select: { manufacturerId: true } },
    },
  });
  if (!version) return null;
  return {
    id: version.id,
    manufacturerId: version.product.manufacturerId,
    productId: version.productId,
    versionId: version.id,
    version: { canonicalName: version.canonicalName },
  };
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
 * Prisma `where` for the assets that any of the matchings applies to, by
 * matchingAppliesToDevice. It holds no asset ids: a product's VERS range becomes
 * the product's versions that satisfy it, so the query grows with the number of
 * versions, not the number of assets. `loose` also accepts an asset with no
 * version on the matching's manufacturer and product (identityAppliesToDevice).
 * With no matchings, the `where` matches no asset.
 */
export async function assetWhereForMatchings(
  matchings: MatchingLike[],
  { loose = false }: { loose?: boolean } = {},
): Promise<Prisma.AssetWhereInput> {
  const clauses = await Promise.all(
    matchings.map(async (matching) => {
      const { productId, versionId, versionRange } = matching;
      const out: Prisma.AssetWhereInput[] = [];
      if (
        productId !== null &&
        versionId === null &&
        versionRange !== null &&
        // A range that matches every version also matches no version.
        !versSatisfies(null, versionRange)
      ) {
        const versions = await prisma.version.findMany({
          where: { productId },
          select: { id: true, canonicalName: true },
        });
        const inRange = versions
          .filter((v) => versSatisfies(v.canonicalName, versionRange))
          .map((v) => v.id);
        if (inRange.length > 0)
          out.push({
            ...assetWhereForMatching(matching),
            versionId: { in: inRange },
          });
      } else {
        out.push(strictAssetWhereForMatching(matching));
      }
      if (
        loose &&
        productId !== null &&
        (versionId !== null || versionRange !== null)
      )
        out.push({ ...assetWhereForMatching(matching), versionId: null });
      return out;
    }),
  );
  return { OR: clauses.flat() };
}

/** How many assets a matching resolves to, by matchingAppliesToDevice. */
export async function resolvedAssetCount(
  matching: MatchingLike,
): Promise<number> {
  return prisma.asset.count({
    where: await assetWhereForMatchings([matching]),
  });
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
