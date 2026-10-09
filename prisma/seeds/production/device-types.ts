import {
  DEVICE_TYPE_ICONS,
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
    const icon = DEVICE_TYPE_ICONS[slug] ?? null;
    const row = await prisma.deviceType.upsert({
      where: { slug },
      create: { slug, displayName, icon, nameMappings },
      update: { displayName, icon, nameMappings },
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

/**
 * Upserts a seed product on its lowercase name. A device type id overwrites
 * the product's type, so the seed wins.
 */
export function upsertSeedProduct(
  name: string,
  deviceTypeId: string | null = null,
) {
  const canonicalName = name.trim().toLowerCase();
  return prisma.product.upsert({
    where: { canonicalName },
    update: deviceTypeId ? { deviceTypeId } : {},
    create: {
      canonicalName,
      canonicalDisplayName: name,
      hasCpe: true,
      deviceTypeId,
    },
  });
}

/**
 * Siemens products in the scripts/seed-*.ts example data, by lowercase name,
 * and the slug of their device type. Symbia.net is software for the Symbia
 * scanners, not one kind of device, so it has none.
 */
export const EXAMPLE_PRODUCT_DEVICE_TYPES: Record<string, string> = {
  "syngo.plaza": "image-archive-pacs",
  "syngo.via": "image-viewer",
  "magnetom family": "magnetic-resonance-imaging",
  "magnetom numaris x": "magnetic-resonance-imaging",
  "mammomat revelation": "mammography",
  "naeotom alpha": "computed-tomography",
  "somatom go.all": "computed-tomography",
  "somatom go.now": "computed-tomography",
  "somatom go.open pro": "computed-tomography",
  "somatom go.sim": "computed-tomography",
  "somatom go.top": "computed-tomography",
  "somatom go.up": "computed-tomography",
  "somatom x.cite": "computed-tomography",
  "somatom x.creed": "computed-tomography",
  "biograph horizon pet/ct systems": "molecular-imaging",
  "symbia e/s": "molecular-imaging",
  "symbia evo": "molecular-imaging",
  "symbia intevo": "molecular-imaging",
  "symbia t": "molecular-imaging",
};

let exampleIdBySlug: Promise<Map<string, string>> | undefined;

/** Upserts a product of the scripts/seed-*.ts example data, with its type. */
export async function upsertExampleProduct(name: string) {
  const slug = EXAMPLE_PRODUCT_DEVICE_TYPES[name.trim().toLowerCase()];
  if (!slug) return upsertSeedProduct(name);
  exampleIdBySlug ??= prisma.deviceType
    .findMany({ select: { id: true, slug: true } })
    .then((rows) => new Map(rows.map((r) => [r.slug, r.id])));
  const deviceTypeId = requireDeviceTypeId(
    await exampleIdBySlug,
    slug,
    `Example product "${name}" (run npx prisma db seed first)`,
  );
  return upsertSeedProduct(name, deviceTypeId);
}
