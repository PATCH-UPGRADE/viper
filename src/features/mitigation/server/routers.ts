import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

// Draft work orders proposed by a plan, in the shape the plan UI renders.
const planWorkOrderSelect = {
  id: true,
  summary: true,
  sourceLabel: true,
  body: true,
  category: true,
  status: true,
  isDraft: true,
} as const;

const mitigationPlanInclude = {
  workOrders: {
    select: planWorkOrderSelect,
    orderBy: { createdAt: "asc" },
  },
} as const;

export const mitigationRouter = createTRPCRouter({
  // All mitigation plans for a notification, ordered (order 0 = recommended),
  // each with its (draft or promoted) work orders.
  getForNotification: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .query(({ input }) =>
      prisma.mitigationPlan.findMany({
        where: { notificationId: input.notificationId },
        include: mitigationPlanInclude,
        orderBy: { order: "asc" },
      }),
    ),

  // Accept a plan: mark it accepted (and every other plan for the notification
  // un-accepted — only one may be accepted), and promote its draft work orders
  // into real tickets by clearing isDraft.
  accept: protectedProcedure
    .input(z.object({ planId: z.string() }))
    .mutation(async ({ input }) => {
      const plan = await prisma.mitigationPlan.findUnique({
        where: { id: input.planId },
        select: { id: true, notificationId: true },
      });
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }

      return prisma.$transaction(async (tx) => {
        await tx.mitigationPlan.updateMany({
          where: { notificationId: plan.notificationId },
          data: { isAccepted: false },
        });
        await tx.mitigationPlan.update({
          where: { id: plan.id },
          data: { isAccepted: true },
        });
        await tx.workOrderTicket.updateMany({
          where: {
            notificationId: plan.notificationId,
            mitigationPlanId: { not: plan.id },
          },
          data: { isDraft: true },
        });
        await tx.workOrderTicket.updateMany({
          where: { mitigationPlanId: plan.id },
          data: { isDraft: false },
        });
        return tx.mitigationPlan.findUniqueOrThrow({
          where: { id: plan.id },
          include: mitigationPlanInclude,
        });
      });
    }),
});
