import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { chatAgent } from "@/inngest/functions/chat-agent";
import {
  enrichAllVulnerabilities,
  enrichVulnerability,
} from "@/inngest/functions/enrich-vulnerabilities";
import {
  syncAllIntegrations,
  syncIntegration,
} from "@/inngest/functions/sync-integrations";
import { purgeExpiredTokensFn } from "@/inngest/functions/purge-expired-user-tokens";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    syncAllIntegrations,
    syncIntegration,
    enrichVulnerability,
    enrichAllVulnerabilities,
    chatAgent,
    purgeExpiredTokensFn,
  ],
});
