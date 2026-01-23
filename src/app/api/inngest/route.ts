import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  syncAllIntegrations,
  syncIntegration,
} from "@/inngest/functions/sync-integrations";

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [syncAllIntegrations, syncIntegration],
});
