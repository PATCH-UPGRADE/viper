"use client";

import { Wrench } from "lucide-react";
import { RemediationCard } from "@/features/remediations/components/remediations";
import type { AssetWithIssueRelations } from "../../types";
import { securityRemediationsOf } from "../../utils";

export function RemediationsSection({
  asset,
}: {
  asset: AssetWithIssueRelations;
}) {
  const remediations = securityRemediationsOf(asset.issues);

  if (remediations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <Wrench className="h-12 w-12 mx-auto opacity-50" />
          <p className="text-sm">No remediations available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {remediations.map((remediation) => (
        <RemediationCard
          remediation={remediation}
          key={`remediation-${remediation.id}`}
        />
      ))}
    </div>
  );
}
