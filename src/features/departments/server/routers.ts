import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const departmentInputSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(2000).nullish(),
  color: z.string().nullish(),
});

const DUPLICATE_NAME_MESSAGE = "A department with that name already exists";

// Translate a racing unique-constraint failure on `name` into a clean CONFLICT,
// matching the precheck's error. Rethrows anything else unchanged.
function rethrowDuplicateName(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_NAME_MESSAGE });
  }
  throw error;
}

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
          message: DUPLICATE_NAME_MESSAGE,
        });
      }
      try {
        return await prisma.department.create({ data: input });
      } catch (error) {
        rethrowDuplicateName(error);
      }
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
            message: DUPLICATE_NAME_MESSAGE,
          });
        }
      }
      try {
        return await prisma.department.update({ where: { id }, data });
      } catch (error) {
        rethrowDuplicateName(error);
      }
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      // Department FKs are SetNull on User and WorkOrderTicket — safe to delete.
      return prisma.department.delete({ where: { id: input.id } });
    }),
});
