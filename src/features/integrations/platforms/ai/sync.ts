import "server-only";
import type { SyncCtx, SyncOutcome } from "@/features/integrations/core/types";
import type { AiConfig, AiCreds } from "./config";

/**
 * VIPER fetches nothing here. It hands the job to n8n, which crawls the
 * upstream on our behalf and POSTs the results to `ctx.callback().url`.
 */
export async function aiSync(
  ctx: SyncCtx<AiConfig, AiCreds>,
): Promise<SyncOutcome> {
  const n8nWebhookUrl = process.env.N8N_AI_SYNC_URL;
  const n8nKey = process.env.N8N_KEY;

  if (!n8nKey || !n8nWebhookUrl) {
    throw new Error("Either N8N_KEY or N8N_AI_SYNC_URL is not defined");
  }

  // Where n8n should respond, and what schema it should respond with.
  const callback = await ctx.callback();

  const response = await fetch(n8nWebhookUrl, {
    method: "POST",
    headers: {
      Authorization: n8nKey,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30000), // 30s timeout
    // NOTE: has to be compatible with whatever we have on n8n
    body: JSON.stringify({
      baseApiUrl: callback.baseApiUrl,
      responsePath: callback.path,
      responseSchema: callback.schema,
      resourceType: ctx.resource,
      integrationUri: ctx.config.integrationUri,
      additionalInstructions: ctx.config.additionalInstructions,
      // NOTE: this forwards the integration's credentials to n8n in
      // plaintext, on purpose. n8n crawls the upstream on our behalf and has to
      // authenticate as us, so `SyncCtx.creds` exists specifically for this
      // path.
      authType: ctx.creds.authType,
      authentication: ctx.creds.authentication,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to sync data: ${response.statusText}`);
  }

  // n8n's ack. The real data arrives later, at the callback; a SyncOutcome
  // carries only the cursor, so this is logged rather than returned.
  console.log("ai sync handed off", {
    resource: ctx.resource,
    ack: await response.json().catch(() => null),
  });

  // A push platform: the callback advances things. Leave the cursor alone and
  // stay Pending until it lands.
  return { cursor: ctx.cursor, pending: true };
}
