import "server-only";
import { TRPCError } from "@trpc/server";
import { requestDebrief } from "@/inngest/events/debrief";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  claimDebriefRun,
  isDebriefAbandoned,
  newestReadyRun,
  parseBullets,
} from "./runs";

/** Columns the client needs. `error` stays server-side; the UI shows a fixed message. */
const debriefSelect = {
  id: true,
  status: true,
  bullets: true,
  since: true,
  createdAt: true,
} as const;

async function callerDepartmentId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });
  return user?.departmentId ?? null;
}

export const debriefRouter = createTRPCRouter({
  getForMyDepartment: protectedProcedure.query(async ({ ctx }) => {
    const departmentId = await callerDepartmentId(ctx.auth.user.id);
    if (!departmentId) return null;

    // Two rows, because they answer different questions. The newest Ready run
    // is what the reader should see; the newest run of any status is what the
    // card reports about. Reading only the newest row would hide the last good
    // brief the moment someone presses Regenerate.
    const [ready, latest] = await Promise.all([
      prisma.debrief.findFirst({
        ...newestReadyRun(departmentId),
        select: debriefSelect,
      }),
      prisma.debrief.findFirst({
        where: { departmentId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          department: { select: { id: true, name: true } },
        },
      }),
    ]);

    if (!latest) return null;

    // A worker that dies between heartbeats leaves its row on `Generating`
    // forever. Read it as the failure it is, so the card stops polling and its
    // Regenerate button re-enables.
    const status = isDebriefAbandoned(latest) ? "Failed" : latest.status;

    return {
      id: ready?.id ?? latest.id,
      department: latest.department,
      bullets: ready ? parseBullets(ready.bullets) : [],
      since: ready?.since ?? null,
      generatedAt: ready?.createdAt ?? null,
      pending: status === "Generating",
      lastRunFailed: status === "Failed",
    };
  }),

  regenerate: protectedProcedure.mutation(async ({ ctx }) => {
    const departmentId = await callerDepartmentId(ctx.auth.user.id);
    if (!departmentId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "You must belong to a department to generate a debrief.",
      });
    }

    const { id, created } = await claimDebriefRun(departmentId);

    if (!created) return { id, queued: false };

    const dispatched = await requestDebrief(id, departmentId);
    if (!dispatched) {
      await prisma.debrief.update({
        where: { id },
        data: { status: "Failed", error: "Could not queue the debrief run." },
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not queue the debrief run. Please try again.",
      });
    }

    return { id, queued: true };
  }),
});
