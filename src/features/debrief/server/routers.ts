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

/**
 * How long a run may stay `Generating` before a new request may replace it.
 *
 * An Inngest run can be evicted, time out, or die mid-step, which leaves its
 * row `Generating` forever. Without this bound the in-flight guard below then
 * refuses every later request and the department never gets another debrief.
 *
 * The value is a placeholder: pin it to the observed p99 agent runtime.
 *  Once the function updates the row per step, bound on
 * `updatedAt` instead, so this means "no progress in 15 minutes" rather than
 * "started over 15 minutes ago".
 */
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

    // Serialise claims for this department for the length of the transaction.
    // Without it, two callers clicking at the same moment both pass the
    // in-flight check below and both open a row: the check and the create are
    // separate statements, so nothing stops the interleave.
    //
    // An advisory lock rather than a partial unique index because Prisma cannot
    // express one — `@@index` has no `where` clause — so the index would have
    // to be raw SQL that `prisma migrate dev` then reports as drift forever.
    // The lock releases on commit or rollback.
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${departmentId}))`;

      // Do not stack runs. If one is already in flight, return it unchanged. A
      // row older than IN_FLIGHT_TIMEOUT_MS is treated as dead, so a crashed
      // run cannot wedge the department.
      const [inFlight, previous] = await Promise.all([
        tx.debrief.findFirst({
          where: {
            departmentId,
            status: "Generating",
            createdAt: { gt: new Date(Date.now() - IN_FLIGHT_TIMEOUT_MS) },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        }),
        tx.debrief.findFirst({
          where: { departmentId, status: "Ready" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ]);
      if (inFlight) return { id: inFlight.id, queued: false };

      const debrief = await tx.debrief.create({
        data: {
          departmentId,
          status: "Generating",
          since: previous?.createdAt ?? null,
        },
        select: { id: true },
      });

      return { id: debrief.id, queued: true };
    });
  }),
});
