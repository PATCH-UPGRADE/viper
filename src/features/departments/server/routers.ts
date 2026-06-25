import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const departmentInputSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(2000).nullish(),
  color: z.string().nullish(),
});

export const departmentsRouter = createTRPCRouter({
  getMany: protectedProcedure.query(async () => {
    const departments = await prisma.department.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { users: true, tickets: true } },
      },
    });
    return departments;
  }),

  create: protectedProcedure
    .input(departmentInputSchema)
    .mutation(async ({ input }) => {
      const existing = await prisma.department.findUnique({
        where: { name: input.name },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A department with that name already exists",
        });
      }
      return prisma.department.create({ data: input });
    }),

  update: protectedProcedure
    .input(departmentInputSchema.partial().extend({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      if (data.name) {
        const collision = await prisma.department.findFirst({
          where: { name: data.name, NOT: { id } },
        });
        if (collision) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A department with that name already exists",
          });
        }
      }
      return prisma.department.update({ where: { id }, data });
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      // Department FKs are SetNull on User and WorkOrderTicket — safe to delete.
      return prisma.department.delete({ where: { id: input.id } });
    }),
});
