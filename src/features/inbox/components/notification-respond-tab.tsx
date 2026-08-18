"use client";

import { useState } from "react";
import {
  MitigationPlansPanel,
  type PlanView,
} from "@/features/mitigation/components/mitigation-plans-panel";
import { useSuspenseMitigationPlans } from "@/features/mitigation/hooks/use-mitigation";
import { cn } from "@/lib/utils";
import type { NotificationDetailWithRelations } from "../types";
import { AffectedAssetsSection } from "./affected-assets-section";
import {
  HospitalImpactCard,
  NotificationSummaryCard,
} from "./notification-impact-cards";

export function NotificationRespondTab({
  notification,
}: {
  notification: NotificationDetailWithRelations;
}) {
  const { data: plans } = useSuspenseMitigationPlans(notification.id);
  const [view, setView] = useState<PlanView>("list");
  // assert plans is nonempty, this tab only renders if so
  const isMatrix = view === "matrix" && plans.length > 1;

  return (
    <>
      <HospitalImpactCard notification={notification} />
      <NotificationSummaryCard notification={notification} />

      <div
        className={cn(
          "grid grid-cols-1 gap-6 pt-2",
          !isMatrix && "lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]",
        )}
      >
        {!isMatrix && <AffectedAssetsSection notification={notification} />}
        <MitigationPlansPanel
          plans={plans}
          notificationId={notification.id}
          isMatrix={isMatrix}
          onViewChange={setView}
        />
      </div>
    </>
  );
}
