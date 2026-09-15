import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { generateBriefing } from "@/features/inbox/agent/briefing";
import { persistBriefing } from "@/features/inbox/agent/briefing/persist";
import { briefingSchema } from "@/features/inbox/agent/briefing/schema";
import { attachMatchingAssets } from "@/features/tracking/server/asset-tickets";
import { validatePlatformPayload } from "@/features/work-orders/server/payload";
import { dispatchSubmission } from "@/features/work-orders/server/submit";
import {
  Priority,
  Prisma,
  SubmissionState,
  TicketCategory,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";

/**
 * File one accepted work order, and never let it fail the acceptance.
 *
 * The payload is re-checked here rather than trusted from drafting time,
 * because a stored payload can outlive the rules that accepted it — an asset
 * can lose the equipment key its platform needs between the plan being drafted
 * and a person accepting it.
 *
 * A plan is accepted as a whole, so one device's platform problem must not
 * block the other work orders. A ticket that can no longer be filed falls back
 * to what VIPER can always do: track it, and record why it went no further.
 */
async function fileAcceptedTicket(
  ticket: {
    id: string;
    targetIntegrationId: string;
    platformPayload: Prisma.JsonValue;
  },
  actorId: string,
): Promise<void> {
  const checked = await validatePlatformPayload(
    ticket.targetIntegrationId,
    ticket.platformPayload,
  );
  if (!checked.ok) {
    await prisma.workOrderTicket.update({
      where: { id: ticket.id },
      data: {
        targetIntegrationId: null,
        platformPayload: Prisma.DbNull,
        submissionState: SubmissionState.NONE,
        submissionError: checked.reason,
      },
    });
    return;
  }

  // dispatchSubmission already recorded FAILED on the ticket, which is where a
  // retry reads from, so a queue that is down does not undo the acceptance.
  const { error } = await dispatchSubmission(ticket.id, actorId);
  if (error) throw new Error(error);
}

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
  // Where this order will be filed. The accept drawer names it, so a person can
  // tell a request going out to a vendor from one VIPER only tracks.
  targetIntegration: { select: { name: true } },
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
    .mutation(async ({ input, ctx }) => {
      const plan = await prisma.mitigationPlan.findUnique({
        where: { id: input.planId },
        select: { id: true, notificationId: true },
      });
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }

      const { targeted } = await prisma.$transaction(async (tx) => {
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
        // isDraft: true excludes tickets an earlier accept call on this same
        // plan already promoted, so a repeated accept doesn't re-run asset
        // matching (and re-record ASSET_ATTACHED activity) for them.
        const promoted = await tx.workOrderTicket.findMany({
          where: { mitigationPlanId: plan.id, isDraft: true },
          select: {
            id: true,
            targetIntegrationId: true,
            platformPayload: true,
            deviceGroups: { select: { deviceGroupMatchingId: true } },
          },
        });
        await tx.workOrderTicket.updateMany({
          where: { mitigationPlanId: plan.id },
          data: { isDraft: false },
        });
        for (const ticket of promoted) {
          await attachMatchingAssets(tx, {
            parentTicketId: ticket.id,
            matchingIds: ticket.deviceGroups.map(
              (group) => group.deviceGroupMatchingId,
            ),
            actorId: ctx.auth.user.id,
          });
        }

        return {
          targeted: promoted.filter(
            (t): t is typeof t & { targetIntegrationId: string } =>
              t.targetIntegrationId !== null,
          ),
        };
      });

      const filings = await Promise.allSettled(
        targeted.map((ticket) => fileAcceptedTicket(ticket, ctx.auth.user.id)),
      );
      filings.forEach((filing, index) => {
        if (filing.status === "rejected") {
          console.error(
            `mitigation.accept: filing ${targeted[index].id} failed`,
            filing.reason,
          );
        }
      });

      // Read after the filings, not inside the transaction. A ticket whose
      // payload no longer fits its platform has its target cleared by the step
      // above, so a plan captured earlier would hand the drawer a vendor it is
      // no longer going to.
      return prisma.mitigationPlan.findUniqueOrThrow({
        where: { id: plan.id },
        include: mitigationPlanInclude,
      });
    }),

  // The audience-tailored explanation of why a plan makes sense. Generated
  // once on first request and cached on the plan; a plan's case for itself
  // doesn't change just because its draft work orders get tweaked later.
  // Not wrapped in a transaction: generateBriefing is an LLM call, and
  // holding a DB transaction open for it risks Prisma's transaction timeout
  // and ties up a pooled connection for no reason — a rare duplicate
  // generation on a concurrent first-load is a cheap, self-correcting race.
  getBriefing: protectedProcedure
    .input(z.object({ planId: z.string() }))
    .query(async ({ input }) => {
      const existing = await prisma.planBriefing.findUnique({
        where: { mitigationPlanId: input.planId },
      });
      if (existing) {
        const parsed = briefingSchema.safeParse(existing.content);
        if (parsed.success) return parsed.data;
        console.warn(
          `getBriefing: stored content for plan ${input.planId} failed validation, regenerating`,
        );
      }

      // Only summary/body/order/etc are needed for the prompt, so this uses
      // its own narrow select instead of mitigationPlanInclude (which also
      // pulls assignee/department joins the agent never reads). The
      // recommended plan (for a non-recommended plan's comparison) is
      // fetched in the same round trip via the notification relation.
      const plan = requireExistence(
        await prisma.mitigationPlan.findUnique({
          where: { id: input.planId },
          select: {
            id: true,
            title: true,
            summary: true,
            compareLine: true,
            cards: true,
            order: true,
            workOrders: {
              select: { summary: true, body: true },
              orderBy: { createdAt: "asc" },
            },
            notification: {
              select: {
                mitigationPlans: {
                  where: { order: 0 },
                  select: { title: true, summary: true },
                },
              },
            },
          },
        }),
        "plan",
      );

      const isRecommended = plan.order === 0;
      const recommendedPlan = isRecommended
        ? null
        : (plan.notification.mitigationPlans[0] ?? null);

      const content = await generateBriefing({
        title: plan.title,
        summary: plan.summary,
        compareLine: plan.compareLine,
        cards: plan.cards,
        isRecommended,
        recommendedPlan,
        workOrders: plan.workOrders.map((w) => ({
          summary: w.summary,
          body: w.body,
        })),
      });
      const saved = await persistBriefing(prisma, plan.id, content);
      return briefingSchema.parse(saved.content);
    }),

  // Edits one audience's briefing text in place; never regenerates it.
  updateBriefing: protectedProcedure
    .input(
      z.object({
        planId: z.string(),
        audience: briefingSchema.keyof(),
        content: z.string().trim().min(1),
      }),
    )
    .mutation(({ input }) =>
      // Locked so two concurrent edits (e.g. different audiences) can't
      // clobber each other's read-modify-write of the shared content blob.
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.planId}))`;

        const existing = requireExistence(
          await tx.planBriefing.findUnique({
            where: { mitigationPlanId: input.planId },
          }),
          "briefing",
        );

        const content = {
          ...briefingSchema.parse(existing.content),
          [input.audience]: input.content,
        };
        return tx.planBriefing.update({
          where: { mitigationPlanId: input.planId },
          data: { content },
        });
      }),
    ),
});
