import "server-only";
import { generateFollowUpQuestion } from "@/features/inbox/agent/question";
import { triageNotification } from "@/features/inbox/agent/triage";
import { sortVulnerabilities } from "@/features/inbox/agent/vex";
import { gatherVexContextForIssue } from "@/features/inbox/agent/vex/context";
import { applyVexDeterminations } from "@/features/inbox/agent/vex/process_output";
import prisma from "@/lib/db";
import { inngest } from "../client";

const MAX_FOLLOWUP_ROUNDS = 2;

export const reevaluateIssueOnAnswer = inngest.createFunction(
  { id: "reevaluate-issue-on-answer" },
  { event: "issue/question.answered" },
  async ({ event, step }) => {
    const { issueId, questionId } = event.data;
    const question = await step.run("load-question", () =>
      prisma.question.findUniqueOrThrow({
        where: { id: questionId },
      }),
    );

    await step.run("resort", async () => {
      if (question.status == "UNSURE" || !question.answer)
        return { skipped: "user-unsure" as const };
      const context = await gatherVexContextForIssue(
        issueId,
        question.notificationId,
        {
          title: question.title,
          reasonWhy: question.reasonWhy,
          answer: question.answer,
        },
      );
      if (!context) return;
      const result = await sortVulnerabilities(context);
      await applyVexDeterminations(context, result);
    });

    const updatedIssue = await step.run("read-updated-issue", () =>
      prisma.issue.findUniqueOrThrow({ where: { id: issueId } }),
    );

    if (updatedIssue.status !== "UNDER_INVESTIGATION") {
      await step.run("retriage-notification", async () => {
        const source = await prisma.notificationSource.findFirst({
          where: { notificationId: question.notificationId },
          orderBy: { receivedAt: "desc" },
        });
        if (!source) return;
        const result = await triageNotification(
          source.id,
          question.notificationId,
        );
        await prisma.notification.update({
          where: { id: question.notificationId },
          data: {
            priority: result.priority,
            priorityReasonWhy: result.priorityReasonWhy,
            hospitalImpact: result.hospitalImpact,
          },
        });
      });
    } else {
      const roundCount = await prisma.question.count({ where: { issueId } });
      if (roundCount < MAX_FOLLOWUP_ROUNDS) {
        await step.run("generate-followup", () =>
          generateFollowUpQuestion(issueId, questionId),
        );
      }
    }
  },
);
