"use client";

import { BugIcon } from "lucide-react";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { IssuesSidebarList } from "@/features/issues/components/issue";
import type { AssetWithIssueRelations } from "../../types";

export function VulnerabilitiesSection({
  asset,
}: {
  asset: AssetWithIssueRelations;
}) {
  const issues = asset.issues;

  if (issues.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <BugIcon className="h-12 w-12 mx-auto opacity-50" />
          <p className="text-sm">No vulnerabilities detected</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<Skeleton className="h-16 w-full" />}>
      <IssuesSidebarList
        issues={issues}
        type="vulnerabilities"
        assetId={asset.id}
      />
    </Suspense>
  );
}
