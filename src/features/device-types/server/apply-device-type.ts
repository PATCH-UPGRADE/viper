import "server-only";
import { TRPCError } from "@trpc/server";
import prisma from "@/lib/db";
import { UNKNOWN_CPE_NAME } from "@/lib/router-utils";

// parseCpe gives every CPE with no product token the product name
// UNKNOWN_CPE_NAME. That one Product row is shared by every manufacturer, so a
// type on it types unrelated devices.
const notSharedUnknownProduct = { canonicalName: { not: UNKNOWN_CPE_NAME } };

/**
 * Map the deviceType slugs of an API request to DeviceType ids. Throws
 * BAD_REQUEST if one slug is unknown, before anything is written.
 */
export async function deviceTypeIdsBySlug(
  slugs: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(slugs.filter((s): s is string => !!s))];
  if (wanted.length === 0) return new Map();

  const rows = await prisma.deviceType.findMany({
    where: { slug: { in: wanted } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));
  const unknown = wanted.filter((slug) => !idBySlug.has(slug));
  if (unknown.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unknown deviceType: ${unknown.join(", ")}`,
    });
  }
  return idBySlug;
}

// TODO: VW-560
/**
 * Check every deviceType slug of an API or partner request, then return a
 * function that gives a product a type from one slug, only if it has none.
 * It tries each product once, because a batch puts many assets on a few
 * products.
 */
export async function prepareDeviceTypeSlugs(
  slugs: (string | null | undefined)[],
) {
  const idBySlug = await deviceTypeIdsBySlug(slugs);
  const triedProductIds = new Set<string>();
  return async (productId: string | null, slug: string | null | undefined) => {
    const deviceTypeId = slug ? idBySlug.get(slug) : undefined;
    if (!productId || !deviceTypeId || triedProductIds.has(productId)) return;
    triedProductIds.add(productId);
    await fillProductDeviceType(productId, deviceTypeId);
  };
}

export type ApplyDeviceType = Awaited<
  ReturnType<typeof prepareDeviceTypeSlugs>
>;

/**
 * Set a product's device type only if it has none, so outside callers cannot
 * change a type that exists. Only the device type seed overwrites a type.
 */
export async function fillProductDeviceType(
  productId: string,
  deviceTypeId: string,
): Promise<void> {
  await prisma.product.updateMany({
    where: { id: productId, deviceTypeId: null, ...notSharedUnknownProduct },
    data: { deviceTypeId },
  });
}
