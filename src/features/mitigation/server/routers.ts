import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Priority, TicketCategory } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

// Draft work orders proposed by a plan, in the shape the plan UI renders and
// the accept drawer edits.
const planWorkOrderSelect = {
  id: true,
  summary: true,
  sourceLabel: true,
  body: true,
  category: true,
  status: true,
  priority: true,
  isDraft: true,
  suggestedAssignee: true,
  assignee: { select: { id: true, name: true, email: true } },
  departments: {
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  },
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

  // Accept a plan: apply the user's edits to its draft work orders, mark it
  // accepted (and every other plan for the notification un-accepted — only one
  // may be accepted), and promote its drafts into real tickets by clearing
  // isDraft.
  accept: protectedProcedure
    .input(
      z.object({
        planId: z.string(),
        edits: z
          .array(
            z.object({
              id: z.string(),
              summary: z.string().trim().min(1).max(255),
              body: z.string().max(10_000).nullable(),
              category: z.enum(TicketCategory),
              priority: z.enum(Priority),
              departmentIds: z.array(z.string()),
              assigneeId: z.string().nullable(),
            }),
          )
          .default([]),
      }),
    )
    .mutation(async ({ input }) => {
      const plan = await prisma.mitigationPlan.findUnique({
        where: { id: input.planId },
        select: { id: true, notificationId: true },
      });
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }

      return prisma.$transaction(async (tx) => {
        if (input.edits.length > 0) {
          // Never trust the ids the client sends — an edit may only touch a
          // work order belonging to the plan being accepted.
          const owned = await tx.workOrderTicket.findMany({
            where: {
              id: { in: input.edits.map((e) => e.id) },
              mitigationPlanId: plan.id,
            },
            select: { id: true },
          });
          if (owned.length !== input.edits.length) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Edited work order does not belong to this plan",
            });
          }

          for (const edit of input.edits) {
            await tx.workOrderTicket.update({
              where: { id: edit.id },
              data: {
                summary: edit.summary,
                body: edit.body,
                category: edit.category,
                priority: edit.priority,
                departments: {
                  set: edit.departmentIds.map((id) => ({ id })),
                },
                assignee: edit.assigneeId
                  ? { connect: { id: edit.assigneeId } }
                  : { disconnect: true },
              },
            });
          }
        }

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
