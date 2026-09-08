import "server-only";
import {
  fileClaimedTicket,
  finishSubmission,
  releaseClaim,
} from "@/features/work-orders/server/submit";
import { inngest } from "../client";

/**
 * File an approved work order on the platform that manages its assets.
 *
 * This runs as a job rather than inside the approval mutation because the fan-out
 * is unbounded: a work order scoped by device group can cover dozens of assets,
 * and signing in to a vendor platform is slow enough that filing them one by one
 * would outlast a serverless request. A timeout mid-flight would leave orders
 * dispatched with nothing recorded.
 *
 * The ticket is already claimed (SUBMITTING) before the event is sent, so this
 * never races another approval.
 */
export const submitWorkOrder = inngest.createFunction(
  {
    id: "submit-work-order",
    // One filing at a time per ticket, whatever re-sends the event.
    concurrency: { key: "event.data.ticketId", limit: 1 },
    // Safe to retry: Inngest memoizes a completed step, so a retry after the
    // outcome write failed skips the filing entirely, and `fileClaimedTicket`
    // skips any child that already carries a mapping even if the whole step
    // re-runs. Without a retry, a failure between filing and recording strands
    // the ticket in SUBMITTING, which nothing can claim again.
    retries: 2,
  },
  { event: "workOrder/submit.requested" },
  async ({ event, step }) => {
    const { ticketId, actorId } = event.data;

    const result = await step.run("file-on-platform", async () => {
      try {
        return await fileClaimedTicket(ticketId, actorId);
      } catch (error) {
        // Nothing was filed, so hand the claim back and let the user retry.
        await releaseClaim(ticketId, error);
        throw error;
      }
    });

    // The claim is only released by one of these two writes. If recording the
    // outcome fails and nothing hands it back, the ticket stays SUBMITTING for
    // good: claimForSubmission takes only PENDING or FAILED, so no approval can
    // ever retry it, and the approval card polls it forever.
    await step.run("record-outcome", async () => {
      try {
        await finishSubmission(
          ticketId,
          result.externalIds.length,
          result.failures,
        );
      } catch (error) {
        await releaseClaim(ticketId, error);
        throw error;
      }
    });

    return {
      filed: result.externalIds.length,
      failed: result.failures.length,
    };
  },
);
