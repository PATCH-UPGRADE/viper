import { z } from "zod";
import type { AlohaStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import { paginationInputSchema } from "@/lib/pagination";
import { fetchPaginated } from "@/lib/router-utils";
import { alohaInputSchema } from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import {
  paginatedTa3SubmissionResponseSchema,
  ta3SubmissionAlohaResponseSchema,
  ta3SubmissionInclude,
  toTa3SubmissionResponse,
} from "../types";

type SubmissionWithRecord = Parameters<typeof toTa3SubmissionResponse>[0] & {
  record: { vulnerabilityId: string };
};

const toResponse = (submission: SubmissionWithRecord) =>
  toTa3SubmissionResponse(submission, submission.record.vulnerabilityId);

const toAlohaResponse = (submission: SubmissionWithRecord) => ({
  ta3Submission: toResponse(submission),
  aloha: { status: submission.alohaStatus, log: submission.alohaLog },
});

/** TA3 uploads, which ALOHA tests one at a time. */
export const ta3SubmissionsRouter = createTRPCRouter({
  // GET /api/ta3Submissions - List TA3 submissions
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/ta3Submissions",
        tags: ["Vulnerabilities"],
        summary: "List TA3 Submissions",
        description:
          "Get TA3 submissions, newest first. Filter with lastUpdatedStartTime and lastUpdatedEndTime to find the ones created or changed since a webhook fired. Any authenticated user can view them.",
      },
    })
    .output(paginatedTa3SubmissionResponseSchema)
    .query(async ({ input }) => {
      const result = await fetchPaginated(prisma.tA3Submission, input, {
        include: ta3SubmissionInclude,
      });
      return { ...result, items: result.items.map(toResponse) };
    }),

  // GET /api/ta3Submissions/{id}/aloha - Get aloha data for a TA3 submission
  getAloha: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/ta3Submissions/{id}/aloha",
        tags: ["Vulnerabilities"],
        summary: "Get TA3 Submission Aloha",
        description:
          "Get aloha status and log for a TA3 submission. Any authenticated user can access.",
      },
    })
    .output(ta3SubmissionAlohaResponseSchema)
    .query(async ({ input }) => {
      const submission = await prisma.tA3Submission.findUnique({
        where: { id: input.id },
        include: ta3SubmissionInclude,
      });
      return toAlohaResponse(requireExistence(submission, "TA3Submission"));
    }),

  // PUT /api/ta3Submissions/{id}/aloha - Update aloha data for a TA3 submission
  updateAloha: protectedProcedure
    .input(z.object({ id: z.string(), data: alohaInputSchema }))
    .meta({
      openapi: {
        method: "PUT",
        path: "/ta3Submissions/{id}/aloha",
        tags: ["Vulnerabilities"],
        summary: "Update TA3 Submission Aloha",
        description:
          "Update aloha status and log for a TA3 submission. Any authenticated user can update.",
      },
    })
    .output(ta3SubmissionAlohaResponseSchema)
    .mutation(async ({ input }) => {
      requireExistence(
        await prisma.tA3Submission.findUnique({
          where: { id: input.id },
          select: { id: true },
        }),
        "TA3Submission",
      );
      const submission = await prisma.tA3Submission.update({
        where: { id: input.id },
        data: {
          alohaStatus: input.data.status as AlohaStatus,
          alohaLog: input.data.log ?? {},
        },
        include: ta3SubmissionInclude,
      });
      return toAlohaResponse(submission);
    }),
});
