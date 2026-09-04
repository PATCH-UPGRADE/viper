import "server-only";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { sendEscalationEmail } from "@/inngest/functions/send-escalation-email";
import prisma from "@/lib/db";
import { renderQnA } from "@/lib/markdown/note";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { draftEscalationEmail } from "../agent/escalationEmail";
import { gatherEscalationContext } from "../agent/escalationEmail/context";
import { resolveEscalationTarget } from "../agent/escalationEmail/process_output";
import { questionInclude, type SuggestedVendorEmail } from "../types";

export const questionsRouter = createTRPCRouter({
  getManyByNotificationId: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .query(({ input }) =>
      prisma.question.findMany({
        where: { notificationId: input.notificationId },
        orderBy: { createdAt: "asc" },
        include: questionInclude,
      }),
    ),
  getManyByIssueId: protectedProcedure
    .input(z.object({ issueId: z.string() }))
    .query(({ input }) =>
      prisma.question.findMany({
        where: { issueId: input.issueId },
        orderBy: { createdAt: "asc" },
        include: questionInclude,
      }),
    ),

  respond: protectedProcedure
    .input(
      z.object({
        questionId: z.string(),
        action: z.enum(["answer", "dismiss", "unsure"]),
        answer: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const question = await prisma.question.findUniqueOrThrow({
        where: { id: input.questionId },
        include: { issue: true },
      });
      if (question.status !== "PENDING") {
        throw new Error(`Question is already ${question.status}`);
      }
      if (input.action === "answer" && !input.answer) {
        throw new Error("answer is required");
      }
      const status: "ANSWERED" | "DISMISSED" | "UNSURE" =
        input.action === "answer"
          ? "ANSWERED"
          : input.action === "dismiss"
            ? "DISMISSED"
            : "UNSURE";
      const hasAnswerText =
        input.action !== "dismiss" && !!input.answer?.trim();
      if (!hasAnswerText) {
        const updated = await prisma.question.updateMany({
          where: { id: input.questionId, status: "PENDING" },
          data: {
            status,
            answeredByUserId: ctx.auth.user.id,
            answeredAt: new Date(),
          },
        });
        if (updated.count === 0) {
          throw new Error(`Question is already resolved`);
        }
        if (input.action !== "dismiss") {
          await inngest.send({
            name: "issue/question.answered",
            data: {
              issueId: question.issueId,
              questionId: input.questionId,
              action: input.action,
            },
          });
        }
        return { status };
      }

      const targetModel = "DEVICE_GROUP_MATCHING" as const;
      const instanceId = question.issue.deviceGroupMatchingId!;

      await prisma.$transaction(async (tx) => {
        const note = await tx.note.create({
          data: {
            text: renderQnA(question.title, input.answer!),
            status: "SCOPED",
            targetModel,
            instanceId,
            userId: ctx.auth.user.id,
          },
        });
        const updated = await tx.question.updateMany({
          where: { id: input.questionId, status: "PENDING" },
          data: {
            status,
            answer: input.answer,
            answeredByUserId: ctx.auth.user.id,
            answeredAt: new Date(),
            resultingNoteId: note.id,
          },
        });
        if (updated.count === 0) {
          throw new Error(`Question is already resolved`);
        }
      });

      await inngest.send({
        name: "issue/question.answered",
        data: {
          issueId: question.issueId,
          questionId: input.questionId,
          action: input.action,
        },
      });

      return { status };
    }),

  getSuggestedEmailByNotificationId: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .query(async ({ ctx, input }): Promise<SuggestedVendorEmail[]> => {
      const sender = await prisma.user.findUnique({
        where: { id: ctx.auth.user.id },
        select: { name: true, department: { select: { name: true } } },
      });
      const signature = [sender?.name, sender?.department?.name]
        .filter(Boolean)
        .join("\n");
      const questions = await prisma.question.findMany({
        where: { notificationId: input.notificationId, status: "UNSURE" },
        include: questionInclude,
      });

      const drafted = await Promise.all(
        questions.map(
          async (question): Promise<SuggestedVendorEmail | null> => {
            const audience = question.audience ?? "MANUFACTURER";

            try {
              const context = await gatherEscalationContext(question, audience);
              if (!context) return null;

              const draft = await draftEscalationEmail(context);
              const target = resolveEscalationTarget(draft, context);

              return {
                questionId: question.id,
                companyName: target.companyName,
                productName: context.productName,
                reasonWhy: draft.reasonWhy,
                contacts: target.contacts,
                toEmails: target.toEmails,
                subject: draft.subject,
                body: `${draft.body.trimEnd()}\n${signature}`,
              };
            } catch (error) {
              console.error(
                `Escalation draft failed for question ${question.id} `,
                error,
              );
              return null;
            }
          },
        ),
      );
      return drafted.filter((email) => email !== null);
    }),

  approveEscalationEmail: protectedProcedure
    .input(
      z.object({
        questionId: z.string(),
        toEmails: z.array(z.string().email()).min(1),
        subject: z.string(),
        body: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await sendEscalationEmail({
        toEmails: input.toEmails,
        subject: input.subject,
        body: input.body,
      });
      return { queued: true };
    }),
});
