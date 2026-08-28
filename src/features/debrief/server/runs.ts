import "server-only";
import type { DebriefStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import { type DebriefBullet, debriefBulletsSchema } from "../types";

/**
 * How long a run may stay `Generating` before a new request may replace it.
 *
 * Bound on `updatedAt`, not `createdAt`, so it means "no progress in 15
 * minutes" rather than "started over 15 minutes ago". The Inngest function
 * touches the row as it works, so a long but healthy run keeps its claim while
 * a crashed one goes stale on schedule.
 *
 * An Inngest run can be evicted, time out, or die mid-step. Without this bound
 * its row stays `Generating` forever and the department never gets another
 * debrief.
 */
export const IN_FLIGHT_TIMEOUT_MS = 15 * 60 * 1000;

/** Cutoff a run must have been touched after to still count as running. */
const staleBefore = () => new Date(Date.now() - IN_FLIGHT_TIMEOUT_MS);

/**
 * Has this run stopped making progress?
 *
 * The claim path and the read path must agree. If the reader called a run
 * abandoned while `claimDebriefRun` still counted it as active, the card would
 * offer a Regenerate button that silently joins the run it just declared dead.
 *
 * Inclusive of the cutoff, because `claimDebriefRun` holds a run active only
 * while `updatedAt` is strictly greater than it.
 */
export function isDebriefAbandoned(run: {
  status: DebriefStatus;
  updatedAt: Date;
}): boolean {
  return run.status === "Generating" && run.updatedAt <= staleBefore();
}

/**
 * The newest Ready run for a department: the brief the reader sees, the
 * context the next run reads back, and the `since` the next claim carries.
 * Shared so the three callers cannot disagree about which row that is.
 */
export const newestReadyRun = (departmentId: string) =>
  ({
    where: { departmentId, status: "Ready" },
    orderBy: { createdAt: "desc" },
  }) as const;

/**
 * Parse a stored `bullets` column. A row written by an older schema, or by
 * hand, can fail the current contract. Return an empty list rather than throw,
 * so one bad row cannot break the overview page or a later run's context.
 */
export function parseBullets(raw: unknown): DebriefBullet[] {
  const parsed = debriefBulletsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  console.warn("[debrief] stored bullets failed validation, showing none");
  return [];
}

export type DebriefClaim = {
  id: string;
  /** False when an active run already existed and this call joined it. */
  created: boolean;
};

/**
 * Reserve a debrief run for a department.
 *
 * One place decides whether a run is already active, so the regenerate button
 * and the nightly cron cannot disagree. Returns the active run untouched when
 * one exists, otherwise opens a fresh `Generating` row carrying `since`.
 *
 * Serialised per department by an advisory lock, so two concurrent callers
 * cannot both open a run — see the body for why a lock rather than a partial
 * unique index.
 */
export async function claimDebriefRun(
  departmentId: string,
): Promise<DebriefClaim> {
  // Serialise claims for this department for the length of the transaction.
  // Without it, two callers arriving together both pass the in-flight check and
  // both open a row: the check and the create are separate statements, so
  // nothing stops the interleave.
  //
  // An advisory lock rather than a partial unique index because Prisma cannot
  // express one — `@@index` has no `where` clause — so the index would have to
  // be raw SQL that `prisma migrate dev` then reports as drift forever. The
  // lock releases on commit or rollback.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${departmentId}))`;

    const [inFlight, previous] = await Promise.all([
      tx.debrief.findFirst({
        where: {
          departmentId,
          status: "Generating",
          updatedAt: { gt: staleBefore() },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      }),
      tx.debrief.findFirst({
        ...newestReadyRun(departmentId),
        select: { createdAt: true },
      }),
    ]);

    if (inFlight) return { id: inFlight.id, created: false };

    const opened = await tx.debrief.create({
      data: {
        departmentId,
        status: "Generating",
        // Null on a department's first ever run. Callers must treat that as
        // "no previous debrief", not as a missing value.
        since: previous?.createdAt ?? null,
      },
      select: { id: true },
    });

    return { id: opened.id, created: true };
  });
}

/**
 * Delete the debriefs a department no longer has a reader for.
 *
 * Only the newest Ready run is shown, and the next run reads that same row back
 * as its context, so once a run reaches Ready nothing older serves anything.
 *
 * Bounded on `createdAt` rather than deleting by id, because a run claimed
 * between the write and this delete is newer than the row just written. Without
 * the bound the prune would take that row out from under the job writing it.
 *
 * Call this only for a run that reached Ready. A failed run must leave the
 * previous brief in place — it is the one the card keeps showing.
 */
export async function pruneSupersededDebriefs(
  departmentId: string,
  keptCreatedAt: Date,
): Promise<number> {
  const { count } = await prisma.debrief.deleteMany({
    where: { departmentId, createdAt: { lt: keptCreatedAt } },
  });
  return count;
}
