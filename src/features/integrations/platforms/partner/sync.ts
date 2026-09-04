import "server-only";
import { authHeaders } from "@/features/integrations/core/credentials";
import type { SyncCtx, SyncOutcome } from "@/features/integrations/core/types";
import type { PartnerConfig, PartnerCreds } from "./config";

/**
 * VIPER asks the partner to push: it POSTs a callback URL and a watermark, gets
 * a 202, and the partner sends pages back to the callback.
 */
export async function partnerSync(
  ctx: SyncCtx<PartnerConfig, PartnerCreds>,
): Promise<SyncOutcome> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(ctx.creds),
  };

  const callback = await ctx.callback();

  const body = JSON.stringify({
    // TODO: blueflow should be able to handle "null". for now though, if there's no date just send one in the past
    since: ctx.lastSuccessfulSync?.toISOString() ?? new Date(0).toISOString(),
    // TODO: the callback token is single-use, so page 2 would
    // 401. Eventually want to support multi-page partner integrations...
    max_pages: 1,
    page_size: 500,
    callback: callback.url,
  });

  const response = await fetch(ctx.config.integrationUri, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(30000), // 30s timeout
    body,
  });

  if (!response.ok) {
    throw new Error(`Failed to sync data: ${response.statusText}`);
  }

  // The partner's 202 ack. The assets themselves arrive at the callback.
  console.log("partner sync handed off", {
    resource: ctx.resource,
    ack: await response.json().catch(() => null),
  });

  // partner integration doesn't use ctx
  return { cursor: ctx.cursor, pending: true };
}
