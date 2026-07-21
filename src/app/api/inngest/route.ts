import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  enrichAllVulnerabilities,
  enrichVulnerability,
} from "@/inngest/functions/enrich-vulnerabilities";
import { manageMemoriesFn } from "@/inngest/functions/manage-memories";
import { processInboxEmail } from "@/inngest/functions/process-inbox-email";
import { purgeExpiredTokensFn } from "@/inngest/functions/purge-expired-user-tokens";
import {
  resolveAllEntityFilters,
  resolveEntityFilterFn,
} from "@/inngest/functions/resolve-entity-filters";
import {
  syncAllIntegrations,
  syncIntegration,
} from "@/inngest/functions/sync-integrations";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    syncAllIntegrations,
    syncIntegration,
    enrichVulnerability,
    enrichAllVulnerabilities,
    manageMemoriesFn,
    purgeExpiredTokensFn,
    processInboxEmail,
    resolveAllEntityFilters,
    resolveEntityFilterFn,
  ],
});
