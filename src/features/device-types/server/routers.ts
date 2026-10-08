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
  const [deviceTypes, groups] = await Promise.all([
    prisma.deviceType.findMany({
      select: { id: true, slug: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.deviceGroup.findMany({
      select: {
        product: { select: { deviceTypeId: true } },
        _count: { select: { assets: { where: countedAssetWhere } } },
      },
    }),
  ]);

  const countByTypeId = new Map<string, number>();
  let untypedAssetCount = 0;
  for (const group of groups) {
    const count = group._count.assets;
    const deviceTypeId = group.product?.deviceTypeId;
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
});
