import prisma from "@/lib/db";

// "unknown"/"EOL"-style sentinels and CPE wildcards map to a null (unknown) version.
export function normalizeVersion(v?: string | null): string | null {
  if (!v || v === "unknown" || v === "-" || v === "*") return null;
  return v;
}

// Mirror of router-utils' CPE-token → versionStatus mapping so seeded device
// groups carry the same semantics as ones resolved from CPEs at runtime:
// "-" => NOT_APPLICABLE, "*"/empty => UNKNOWN, any value => KNOWN.
export function cpeVersionStatus(
  cpe: string,
): "UNKNOWN" | "NOT_APPLICABLE" | "KNOWN" {
  const token = cpe.split(":")[5] ?? "";
  if (token === "-") return "NOT_APPLICABLE";
  if (token === "" || token === "*") return "UNKNOWN";
  return "KNOWN";
}

// Canonical resolvers (seed avoids importing the server-only router-utils).
// canonicalName is @unique so upsert is race-safe.
export async function upsertManufacturer(name: string) {
  const canonicalName = name.trim().toLowerCase();
  const manufacturerByNameOrAlias = await prisma.manufacturer.findFirst({
    where: {
      OR: [{ canonicalName }, { nameMappings: { has: canonicalName } }],
    },
  });
  if (manufacturerByNameOrAlias) return manufacturerByNameOrAlias;
  return prisma.manufacturer.upsert({
    where: { canonicalName },
    update: {},
    create: { canonicalName, canonicalDisplayName: name, hasCpe: true },
  });
}

export function upsertProduct(name: string) {
  const canonicalName = name.trim().toLowerCase();
  return prisma.product.upsert({
    where: { canonicalName },
    update: {},
    create: { canonicalName, canonicalDisplayName: name, hasCpe: true },
  });
}

export function upsertVersion(name: string) {
  const canonicalName = name.trim().toLowerCase();
  return prisma.version.upsert({
    where: { canonicalName },
    update: {},
    create: { canonicalName, canonicalDisplayName: name, hasCpe: true },
  });
}

type GroupIdentity = {
  manufacturerId: string | null;
  productId: string | null;
  versionId: string | null;
};

// Find-or-create a shared DeviceGroupMatching for a device-group identity.
export async function matchingForGroup(
  dg: GroupIdentity,
): Promise<string | null> {
  if (!dg.manufacturerId) return null;
  const where = {
    manufacturerId: dg.manufacturerId,
    productId: dg.productId,
    versionId: dg.versionId,
    versionRange: null,
  };
  const existing = await prisma.deviceGroupMatching.findFirst({ where });
  const matching =
    existing ?? (await prisma.deviceGroupMatching.create({ data: where }));
  return matching.id;
}

// Resolve CPE strings to shared DeviceGroupMatching ids (via their device group)
// so workflow ASSET nodes can link a device class relationally instead of by CPE.
export async function matchingIdsForCpes(cpes: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const cpe of cpes) {
    const dg = await prisma.deviceGroup.findFirst({
      where: { cpe: { has: cpe } },
      select: {
        id: true,
        manufacturerId: true,
        productId: true,
        versionId: true,
      },
    });
    if (!dg) {
      console.warn(`⚠️  No device group for CPE ${cpe}; skipping matching link`);
      continue;
    }
    const matchingId = await matchingForGroup(dg);
    if (matchingId) ids.push(matchingId);
  }
  return [...new Set(ids)];
}
