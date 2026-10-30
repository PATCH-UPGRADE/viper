import "server-only";
import { z } from "zod";
import { AssetStatus, type Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const deviceTypeCountsSchema = z.object({
  items: z.array(
    z.object({
      slug: z.string(),
      displayName: z.string(),
      assetCount: z.number().int(),
    }),
  ),
  untypedAssetCount: z.number().int(),
});

// Every asset but a decommissioned one. An asset with no status counts too:
// Fleet never sends one, and `status: { not: ... }` alone leaves out NULL.
const countedAssetWhere: Prisma.AssetWhereInput = {
  OR: [{ status: null }, { status: { not: AssetStatus.Decommissioned } }],
};

/**
 * The number of assets of each device type. untypedAssetCount is the assets
 * whose product has no device type: while it is above 0, a type's count is
 * only a lower bound.
 */
export async function countAssetsByDeviceType(): Promise<
  z.infer<typeof deviceTypeCountsSchema>
> {
  const [deviceTypes, products, assetsWithoutProduct] = await Promise.all([
    prisma.deviceType.findMany({
      select: { id: true, slug: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.product.findMany({
      select: {
        deviceTypeId: true,
        _count: { select: { assets: { where: countedAssetWhere } } },
      },
    }),
    prisma.asset.count({ where: { ...countedAssetWhere, productId: null } }),
  ]);

  const countByTypeId = new Map<string, number>();
  let untypedAssetCount = assetsWithoutProduct;
  for (const product of products) {
    const count = product._count.assets;
    const deviceTypeId = product.deviceTypeId;
    if (deviceTypeId) {
      countByTypeId.set(
        deviceTypeId,
        (countByTypeId.get(deviceTypeId) ?? 0) + count,
      );
    } else {
      untypedAssetCount += count;
    }
  }

  return {
    items: deviceTypes.map(({ id, slug, displayName }) => ({
      slug,
      displayName,
      assetCount: countByTypeId.get(id) ?? 0,
    })),
    untypedAssetCount,
  };
}

export async function getDeviceGuides({
  deviceTypeIds,
  productIds,
}: {
  deviceTypeIds: string[];
  productIds: string[];
}) {
  const topic = "TYPICAL_USAGE";
  const [deviceTypes, productGuides] = await Promise.all([
    prisma.deviceType.findMany({
      where: { id: { in: deviceTypeIds } },
      select: {
        id: true,
        displayName: true,
        guides: { where: { topic }, select: { body: true } },
      },
    }),
    productIds.length === 0
      ? []
      : prisma.deviceGuide.findMany({
          where: { topic, productId: { in: productIds } },
          select: { productId: true, body: true },
        }),
  ]);
  return {
    deviceTypes: deviceTypes.map((deviceType) => ({
      id: deviceType.id,
      displayName: deviceType.displayName,
      generalText: deviceType.guides[0]?.body ?? null,
    })),
    productGuides,
  };
}
export type DeviceGuides = Awaited<ReturnType<typeof getDeviceGuides>>;

export const deviceTypesRouter = createTRPCRouter({
  getMany: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/deviceTypes",
        tags: ["DeviceTypes"],
        summary: "List Device Types",
        description:
          "List every device type with the number of assets of that type. Decommissioned assets are not counted. untypedAssetCount is the number of assets whose product has no device type.",
      },
    })
    .input(z.object({}))
    .output(deviceTypeCountsSchema)
    .query(() => countAssetsByDeviceType()),

  getGuides: protectedProcedure
    .input(
      z.object({
        deviceTypeIds: z.array(z.string()),
        productIds: z.array(z.string()),
      }),
    )
    .query(({ input }) => getDeviceGuides(input)),
});
