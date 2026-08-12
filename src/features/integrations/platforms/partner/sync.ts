import "server-only";
import { z } from "zod";
import { authHeaders } from "@/features/integrations/core/credentials";
import type { SyncCtx, SyncOutcome } from "@/features/integrations/core/types";
import type { PartnerConfig, PartnerCreds } from "./config";

/**
 * A watermark cursor: "ask for everything changed since this".
 *
 * Inert today — `partnerSync` returns `pending: true` and never writes a cursor,
 * so this always misses and falls through to `lastSuccessfulSync`. It is
 * versioned so the shape can change later without misreading an old value, and
 * declared now so the fallback order is explicit rather than accidental.
 */
const partnerCursorSchema = z.object({ v: z.literal(1), since: z.string() });

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
  const parsedCursor = partnerCursorSchema.safeParse(ctx.cursor);

  const body = JSON.stringify({
    // TODO: blueflow should be able to handle "null". for now though, if there's no date just send one in the past
    since:
      (parsedCursor.success ? parsedCursor.data.since : null) ??
      ctx.lastSuccessfulSync?.toISOString() ??
      new Date(0).toISOString(),
    // TODO: the callback token is single-use, so page 2 would
    // 401. Eventually want to support multi-page partner integrations...
    max_pages: 1,
    page_size: 500,
    callback: callback.url,
  });

  // Deliberately raw `fetch` rather than `Session.request`: the latter resolves
  // paths against a base URL, which would mangle a partner `integrationUri`
  // that already carries a path.
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

  return { cursor: ctx.cursor, pending: true };
}
