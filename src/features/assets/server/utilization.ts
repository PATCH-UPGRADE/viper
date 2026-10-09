import "server-only";
import { PAGINATION } from "@/config/constants";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { assetUtilizationSchema } from "../types";
import { deviceTypeLabelSelect, getAssetTitle } from "../utils";

export async function fetchUtilizationGrids(where: Prisma.AssetWhereInput) {
  const limit = PAGINATION.DEFAULT_PAGE_SIZE;

  const rows = await prisma.asset.findMany({
    where,
    select: {
      id: true,
      hostname: true,
      utilization: true,
      deviceGroup: {
        select: {
          product: {
            select: deviceTypeLabelSelect,
          },
        },
      },
    },
    orderBy: [
      { deviceGroup: { product: { deviceType: { displayName: "asc" } } } },
      { hostname: "asc" },
    ],
    take: limit + 1,
  });

  const totalAssetCount =
    rows.length > limit ? await prisma.asset.count({ where }) : rows.length;

  return {
    totalAssetCount,
    assets: rows.slice(0, limit).map((asset) => {
      const parsed = assetUtilizationSchema.safeParse(asset.utilization);
      return {
        id: asset.id,
        label: getAssetTitle(asset),
        hostname: asset.hostname,
        utilization: parsed.success ? parsed.data : null,
      };
    }),
  };
}

export type UtilizationGridsResult = Awaited<
  ReturnType<typeof fetchUtilizationGrids>
>;
