import "server-only";
import { inngest } from "../client";

/**
 * The debrief event name and its sender, deliberately in their own module.
 *
 * The tRPC debrief router dispatches this event, and the appRouter imports that
 * router. The handler in `functions/generate-debriefs.ts` imports the scout,
 * which reaches `query_platform_data` and therefore `@/trpc/agent-caller`,
 * which imports the appRouter again.
 *
 * Importing the handler module from the router closes that loop, and a cycle
 * through the appRouter leaves its procedures undefined at runtime — every tRPC
 * route, including the v1 API, then returns 500. Keeping the sender here means
 * the router only ever reaches the Inngest client.
 */
export const DEBRIEF_EVENT = "debrief/generate.requested" as const;

export type DebriefEventData = {
  debriefId: string;
  departmentId: string;
  /** Absent on the manual path; the handler then runs its own scout. */
  findings?: string;
  /**
   * Deduplication key for `idempotency: "event.data.key"` on the handler.
   * Typed here rather than left inline: the Inngest client does not check the
   * payload shape, so dropping this field would silently disable deduplication
   * and let one claimed run execute twice.
   */
  key: string;
};

/**
 * Ask for a debrief to be generated into an already-claimed row.
 *
 * The caller claims the row first (see `claimDebriefRun`) so the UI can show a
 * pending state immediately, and so the row id is a natural idempotency key:
 * one requested run, one execution.
 */
/**
 * Build the event payload. Both senders go through this — the mutation below
 * and the nightly cron — so a missing field is a compile error at either. The
 * Inngest client is constructed without `schemas`, so nothing else checks it.
 */
export function debriefEvent(
  debriefId: string,
  departmentId: string,
  findings?: string,
) {
  const data: DebriefEventData = {
    debriefId,
    departmentId,
    findings,
    key: debriefId,
  };
  return { name: DEBRIEF_EVENT, data } as const;
}

export async function requestDebrief(
  debriefId: string,
  departmentId: string,
  findings?: string,
): Promise<boolean> {
  try {
    await inngest.send(debriefEvent(debriefId, departmentId, findings));
    return true;
  } catch (err) {
    console.error(
      `Failed to request debrief for department ${departmentId}`,
      err,
    );
    return false;
  }
}
