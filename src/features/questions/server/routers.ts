import "server-only";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { renderQnA } from "@/lib/markdown/note";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";

export const questionsRouter = createTRPCRouter({
  getManyByNotificationId: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .query(({ input }) =>
      prisma.question.findMany({
        where: { notificationId: input.notificationId },
        orderBy: { createdAt: "asc" },
        include: {
          issue: {
            include: {
              vulnerability: true,
              deviceGroupMatching: true,
              asset: true,
            },
          },
        },
      }),
    ),
  getManyByIssueId: protectedProcedure
    .input(z.object({ issueId: z.string() }))
    .query(({ input }) =>
      prisma.question.findMany({
        where: { issueId: input.issueId },
        orderBy: { createdAt: "asc" },
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
          where: { id: input.questionId },
          data: {
            status,
            answeredByUserId: ctx.auth.user.id,
            answeredAt: new Date(),
          },
        });
        if (updated.count === 0) {
          throw new Error(`Question is already resolved`);
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
          where: { id: input.questionId },
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
        data: { issueId: question.issueId, questionId: input.questionId },
      });

      return { status };
    }),
});
