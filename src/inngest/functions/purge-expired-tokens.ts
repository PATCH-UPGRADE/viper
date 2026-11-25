import "server-only";
import { purgeExpiredTokens } from "@/lib/tokens";
import { inngest } from "../client";

export const purgeExpiredTokensFn = inngest.createFunction(
  { id: "purge-expired-tokens" },
  { cron: "0 */6 * * *" }, // every 6 hours
  async ({ logger }) => {
    const deleted = await purgeExpiredTokens();
    logger.info(`Purged ${deleted} expired token(s)`);
    return { deleted };
  },
);
