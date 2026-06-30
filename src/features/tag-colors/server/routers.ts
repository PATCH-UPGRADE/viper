import "server-only";
import { z } from "zod";
import { TicketCategory } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

export const tagColorsRouter = createTRPCRouter({
  getCategoryColors: protectedProcedure.query(async () => {
    const rows = await prisma.categoryColor.findMany();
    return rows;
  }),

  setCategoryColor: protectedProcedure
    .input(
      z.object({
        category: z.enum(TicketCategory),
        color: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      return prisma.categoryColor.upsert({
        where: { category: input.category },
        update: { color: input.color },
        create: { category: input.category, color: input.color },
      });
    }),
});
