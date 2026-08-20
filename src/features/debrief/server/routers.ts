import "server-only";
import { TRPCError } from "@trpc/server";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { type DebriefBullet, debriefBulletsSchema } from "../types";

/** Columns the client needs. `error` stays server-side; the UI shows a fixed message. */
const debriefSelect = {
  id: true,
  status: true,
  bullets: true,
  since: true,
  createdAt: true,
} as const;


function parseBullets(raw: unknown): DebriefBullet[] {
  const parsed = debriefBulletsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  console.warn("[debrief] stored bullets failed validation, showing none");
  return [];
}

const IN_FLIGHT_TIMEOUT_MS = 15 * 60 * 1000;

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

    // Do not stack runs. If one is already in flight, return it unchanged. A
    // row older than IN_FLIGHT_TIMEOUT_MS is treated as dead, so a crashed run
    // cannot wedge the department.
    const [inFlight, previous] = await Promise.all([
      prisma.debrief.findFirst({
        where: {
          departmentId,
          status: "Generating",
          createdAt: { gt: new Date(Date.now() - IN_FLIGHT_TIMEOUT_MS) },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      }),
      prisma.debrief.findFirst({
        where: { departmentId, status: "Ready" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);
    if (inFlight) return { id: inFlight.id, queued: false };

    const debrief = await prisma.debrief.create({
      data: {
        departmentId,
        status: "Generating",
        since: previous?.createdAt ?? null,
      },
      select: { id: true },
    });

    return { id: debrief.id, queued: true };
  }),
});
