import "server-only";
import { purgeOldDebriefs } from "@/features/debrief/server/runs";
import { inngest } from "../client";

export const purgeOldDebriefsFn = inngest.createFunction(
  { id: "purge-old-debriefs" },
  // After the 05:00 generation, so the run it just wrote is counted.
  { cron: "0 6 * * *" },
  async ({ logger }) => {
    const deleted = await purgeOldDebriefs();
    logger.info(`Purged ${deleted} old debrief(s)`);
    return { deleted };
  },
);
