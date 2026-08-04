import "server-only";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

export const vendorsRouter = createTRPCRouter({
  getMany: protectedProcedure.query(async () => {
    const vendors = await prisma.vendor.findMany({
      orderBy: { canonicalDisplayName: "asc" },
      select: {
        id: true,
        canonicalName: true,
        canonicalDisplayName: true,
        overview: true,
        partnerSince: true,
        contracts: { select: { covers: { select: { assetId: true } } } },
      },
    });

    return vendors.map(({ contracts, ...vendor }) => ({
      ...vendor,
      // Contracts under one vendor may overlap, so the same asset can appear twice.
      assetCount: new Set(
        contracts.flatMap((contract) => contract.covers.map((c) => c.assetId)),
      ).size,
    }));
  }),
});
