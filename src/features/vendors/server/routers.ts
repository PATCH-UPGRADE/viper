import "server-only";
import prisma from "@/lib/db";
import { paginationInputSchema } from "@/lib/pagination";
import { fetchPaginated } from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { type VendorListRow, vendorListSelect } from "../types";

export const vendorsRouter = createTRPCRouter({
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .query(async ({ input }) => {
      const result = await fetchPaginated(prisma.vendor, input, {
        orderBy: { canonicalDisplayName: "asc" },
        select: vendorListSelect,
      });

      const items = (result.items as VendorListRow[]).map(
        ({ contracts, ...vendor }) => ({
          ...vendor,
          // Contracts under one vendor may overlap, so the same asset can appear twice.
          assetCount: new Set(
            contracts.flatMap((contract) =>
              contract.covers.map((c) => c.assetId),
            ),
          ).size,
        }),
      );

      return { ...result, items };
    }),
});
