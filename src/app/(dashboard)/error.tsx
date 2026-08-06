"use client";

import { ErrorView } from "@/components/entity-components";
import { Button } from "@/components/ui/button";
import { useReportClientError } from "@/hooks/use-report-client-error";

/**
 * Catches anything the page-level boundaries miss — a throw from a Server
 * Component, a nested layout, or a render outside a page's own boundary. It
 * renders inside the dashboard layout, so the sidebar and chrome survive;
 * without it these errors unwind to global-error.tsx and replace the whole
 * document.
 *
 * Next.js does not send an error from the layout of the same segment to this
 * file. A throw from `(dashboard)/layout.tsx` still goes to global-error.tsx.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportClientError(error);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <ErrorView message="Something went wrong loading this page." />
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
