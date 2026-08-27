import "server-only";
import { TRPCError } from "@trpc/server";
import { requestDebrief } from "@/inngest/events/debrief";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { claimDebriefRun, parseBullets } from "./runs";

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

    // Read the department through the relation, so it costs nothing on the
    // common early path where the department has no debrief yet.
    const debrief = await prisma.debrief.findFirst({
      where: { departmentId },
      orderBy: { createdAt: "desc" },
      select: {
        ...debriefSelect,
        department: { select: { id: true, name: true } },
      },
    });

    if (!debrief) return null;

    return {
      id: debrief.id,
      department: debrief.department,
      status: debrief.status,
      bullets: debrief.status === "Ready" ? parseBullets(debrief.bullets) : [],
      since: debrief.since,
      generatedAt: debrief.createdAt,
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
