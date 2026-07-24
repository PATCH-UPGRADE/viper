import * as Sentry from "@sentry/nextjs";

export async function register() {
  // TEMP streaming probe: set DISABLE_SENTRY=1 in Vercel env to skip Sentry
  // runtime init and confirm whether its HTTP instrumentation is what buffers
  // SSE responses. Remove this guard once the streaming cause is settled.
  if (process.env.DISABLE_SENTRY === "1") {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
