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
};

/**
 * Ask for a debrief to be generated into an already-claimed row.
 *
 * The caller claims the row first (see `claimDebriefRun`) so the UI can show a
 * pending state immediately, and so the row id is a natural idempotency key:
 * one requested run, one execution.
 */
export async function requestDebrief(
  debriefId: string,
  departmentId: string,
  findings?: string,
): Promise<boolean> {
  try {
    await inngest.send({
      name: DEBRIEF_EVENT,
      data: { debriefId, departmentId, findings, key: debriefId },
    });
    return true;
  } catch (err) {
    console.error(
      `Failed to request debrief for department ${departmentId}`,
      err,
    );
    return false;
  }
}
