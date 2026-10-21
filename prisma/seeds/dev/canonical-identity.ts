import prisma from "@/lib/db";

export { upsertSeedProduct as upsertProduct } from "../production/device-types";

// "unknown"/"EOL"-style sentinels and CPE wildcards map to a null (unknown) version.
export function normalizeVersion(v?: string | null): string | null {
  if (!v || v === "unknown" || v === "-" || v === "*") return null;
  return v;
}

// The versionStatus of a sample CPE's version token:
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
    create: { canonicalName, canonicalDisplayName: name },
  });
}

export function upsertVersion(productId: string, name: string) {
  const canonicalName = name.trim().toLowerCase();
  return prisma.version.upsert({
    where: { productId_canonicalName: { productId, canonicalName } },
    update: {},
    create: { productId, canonicalName, canonicalDisplayName: name },
  });
}

export type DeviceIds = {
  manufacturerId: string | null;
  productId: string | null;
  versionId: string | null;
};

// Find-or-create a shared DeviceGroupMatching for a device identity. A product
// with no version takes the sample's versionStatus: NOT_APPLICABLE for a "-"
// version token, otherwise UNKNOWN.
export async function matchingForDevice(
  device: DeviceIds & { versionStatus?: ReturnType<typeof cpeVersionStatus> },
): Promise<string | null> {
  if (!device.manufacturerId) return null;
  const noVersion = device.productId !== null && device.versionId === null;
  const where = {
    manufacturerId: device.manufacturerId,
    productId: device.productId,
    versionId: device.versionId,
    versionRange: null,
    versionStatus: !noVersion
      ? ("KNOWN" as const)
      : device.versionStatus === "NOT_APPLICABLE"
        ? ("NOT_APPLICABLE" as const)
        : ("UNKNOWN" as const),
  };
  const existing = await prisma.deviceGroupMatching.findFirst({ where });
  const matching =
    existing ?? (await prisma.deviceGroupMatching.create({ data: where }));
  return matching.id;
}
