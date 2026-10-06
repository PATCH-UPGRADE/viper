import {
  DEVICE_TYPES,
  FLEET_PRODUCT_DEVICE_TYPES,
} from "@/features/device-types/device-types";
import prisma from "@/lib/db";

export function requireDeviceTypeId(
  idBySlug: Map<string, string>,
  slug: string,
  owner: string,
): string {
  const id = idBySlug.get(slug);
  if (!id) throw new Error(`${owner} has unknown device type ${slug}`);
  return id;
}

/** Upserts the VIPER device types. Returns their ids by slug. */
export async function seedDeviceTypes() {
  const idBySlug = new Map<string, string>();
  for (const { slug, displayName, nameMappings } of DEVICE_TYPES) {
    const row = await prisma.deviceType.upsert({
      where: { slug },
      create: { slug, displayName, nameMappings },
      update: { displayName, nameMappings },
    });
    idBySlug.set(slug, row.id);
  }
  return idBySlug;
}

/**
 * Links the known teamplay Fleet products to their device types. Always
 * overwrites Product.deviceTypeId, also a type from API input or a sync.
 * Returns the number of products.
 */
export async function seedFleetProducts(idBySlug: Map<string, string>) {
  const products = Object.entries(FLEET_PRODUCT_DEVICE_TYPES);
  for (const [name, slug] of products) {
    const deviceTypeId = requireDeviceTypeId(
      idBySlug,
      slug,
      `Fleet product "${name}"`,
    );
    // Same match as resolveProduct, which is server-only.
    const canonicalName = name.trim().toLowerCase();
    const existing = await prisma.product.findFirst({
      where: {
        OR: [{ canonicalName }, { nameMappings: { has: canonicalName } }],
      },
    });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: { deviceTypeId },
      });
    } else {
      await prisma.product.create({
        data: { canonicalName, canonicalDisplayName: name, deviceTypeId },
      });
    }
  }
  return products.length;
}
