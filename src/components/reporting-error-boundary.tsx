"use client";

import * as Sentry from "@sentry/nextjs";
import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

/**
 * Page-level error boundary that reports what it catches.
 *
 * A boundary that renders a fallback has *handled* the error, so it never
 * reaches the browser's global handler and Sentry never hears about it.
 * Server-side failures are covered by `onRequestError` (src/instrumentation.ts),
 * but a client-side render error — a suspense query that throws after
 * hydration, for example — is only visible here.
 *
 * The reporting lives in this wrapper rather than an `onError` prop at each
 * call site because those call sites are Server Components, which cannot pass
 * a function across the client boundary.
 *
 * A `notFound()` or `redirect()` call from a client component in the subtree
 * throws too. `unstable_rethrow` passes those values up to the Next.js boundary
 * above, so the 404 page or the redirect still happens. Rethrowing from the
 * render phase also means the boundary never commits, so `onError` never runs
 * for them — it only ever sees errors this boundary actually handles.
 */
export const ReportingErrorBoundary = ({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) => (
  <ErrorBoundary
    fallbackRender={({ error }) => {
      unstable_rethrow(error);
      return fallback;
    }}
    onError={(error, info) => {
      Sentry.captureException(error, {
        contexts: { react: { componentStack: info.componentStack } },
      });
    }}
  >
    {children}
  </ErrorBoundary>
);
