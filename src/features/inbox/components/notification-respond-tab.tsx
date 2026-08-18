"use client";

import { useState } from "react";
import { Accordion } from "@/components/ui/accordion";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MitigationPlanItem } from "@/features/mitigation/components/mitigation-plan-item";
import { MitigationPlanMatrix } from "@/features/mitigation/components/mitigation-plan-matrix";
import { useSuspenseMitigationPlans } from "@/features/mitigation/hooks/use-mitigation";
import { cn } from "@/lib/utils";
import type { NotificationDetailWithRelations } from "../types";
import { AffectedAssetsSection } from "./affected-assets-section";
import {
  HospitalImpactCard,
  NotificationSummaryCard,
} from "./notification-impact-cards";

const COLUMN_HEADING = "font-semibold uppercase tracking-wide text-sm";

type PlanView = "list" | "matrix";

export function NotificationRespondTab({
  notification,
}: {
  notification: NotificationDetailWithRelations;
}) {
  const { data: plans } = useSuspenseMitigationPlans(notification.id);
  const [view, setView] = useState<PlanView>("list");
  const acceptedPlan = plans.find((p) => p.isAccepted);

  const canCompare = plans.length > 1;
  const isMatrix = canCompare && view === "matrix";

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
        {/* What's affected */}
        {!isMatrix && <AffectedAssetsSection notification={notification} />}

        {/* Choose a response plan */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className={COLUMN_HEADING}>Choose a response plan</h3>
            {canCompare && (
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(next) => next && setView(next as PlanView)}
                aria-label="Response plan view"
                className="h-9 rounded-lg bg-accent p-[3px] dark:bg-muted"
              >
                {(["list", "matrix"] as const).map((value) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    className="h-full rounded-md border border-transparent px-4 capitalize text-foreground/60 hover:bg-transparent hover:text-foreground data-[state=on]:border-border data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:border-input dark:data-[state=on]:bg-input"
                  >
                    {value}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          </div>

          {isMatrix ? (
            <MitigationPlanMatrix
              plans={plans}
              notificationId={notification.id}
            />
          ) : (
            // plans is nonempty: this tab only renders when the notification has plans.
            <Accordion
              type="single"
              collapsible
              defaultValue={acceptedPlan?.id ?? plans[0].id}
              className="flex flex-col gap-4"
            >
              {plans.map((plan) => (
                <MitigationPlanItem
                  key={plan.id}
                  plan={plan}
                  notificationId={notification.id}
                  hasAcceptedPlan={acceptedPlan !== undefined}
                />
              ))}
            </Accordion>
          )}
        </section>

        {/* Second slot, not a CSS order swap: DOM order must match visual order for 508. */}
        {isMatrix && (
          <AffectedAssetsSection
            notification={notification}
            className="max-w-[26rem]"
          />
        )}
      </div>
    </>
  );
}
