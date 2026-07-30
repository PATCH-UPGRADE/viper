import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { analyzeRemediation } from "@/inngest/functions/analyze-remediation";
import {
  enrichAllVulnerabilities,
  enrichVulnerability,
} from "@/inngest/functions/enrich-vulnerabilities";
import { extractArtifactNotesFn } from "@/inngest/functions/extract-artifact-notes";
import { processInboxEmail } from "@/inngest/functions/process-inbox-email";
import { purgeExpiredTokensFn } from "@/inngest/functions/purge-expired-user-tokens";
import { reevaluateIssueOnAnswer } from "@/inngest/functions/reevaluate-issue-on-answer";
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
    purgeExpiredTokensFn,
    processInboxEmail,
    analyzeRemediation,
    resolveAllEntityFilters,
    resolveEntityFilterFn,
    extractArtifactNotesFn,
    reevaluateIssueOnAnswer,
  ],
});
