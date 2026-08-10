"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Reports an error caught by a route-level `error.tsx` to Sentry.
 *
 * A server-side error already reached Sentry through `onRequestError`
 * (src/instrumentation.ts) and is the only kind that carries a digest.
 * Reporting only the client-side ones keeps one failure to one event.
 */
export const useReportClientError = (error: Error & { digest?: string }) => {
  useEffect(() => {
    if (!error.digest) {
      Sentry.captureException(error);
    }
  }, [error]);
};
