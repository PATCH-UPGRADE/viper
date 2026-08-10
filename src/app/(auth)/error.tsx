"use client";

import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportClientError } from "@/hooks/use-report-client-error";

/**
 * Route-level boundary for login and signup. Without it an error here unwinds
 * to global-error.tsx, which replaces the whole document.
 * This keeps the auth layout and offers a retry.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportClientError(error);

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <AlertTriangleIcon className="size-6 text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        Something went wrong. Please try again.
      </p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
