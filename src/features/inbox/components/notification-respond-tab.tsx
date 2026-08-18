"use client";

import { useState } from "react";
import { Accordion } from "@/components/ui/accordion";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MitigationPlanItem } from "@/features/mitigation/components/mitigation-plan-item";
import { MitigationPlanMatrix } from "@/features/mitigation/components/mitigation-plan-matrix";
import { useSuspenseMitigationPlans } from "@/features/mitigation/hooks/use-mitigation";
import { cn } from "@/lib/utils";
import type { NotificationDetailWithRelations } from "../types";
import {
  type Bucket,
  BucketAccordion,
  firstNonEmptyBucket,
  NotInInventoryCard,
} from "./affected-assets-accordion";
import {
  HospitalImpactCard,
  NotificationSummaryCard,
} from "./notification-impact-cards";

const RESPOND_BUCKETS = [
  "AFFECTED",
  "UNDER_INVESTIGATION",
  "NOT_AFFECTED",
] as const satisfies readonly Bucket[];

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
  // assert plans is nonempty, this tab only renders if so

  const { affectedAssets, deviceGroupsMatchings } = notification;
  const hasAnyGroup = RESPOND_BUCKETS.some((b) => affectedAssets[b].length > 0);
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
        {!isMatrix && (
          <section>
            <div className="flex flex-col gap-3 sticky top-0">
              <h3 className={COLUMN_HEADING}>What&apos;s affected</h3>

              {hasAnyGroup ? (
                <Accordion
                  type="single"
                  collapsible
                  defaultValue={firstNonEmptyBucket(
                    affectedAssets,
                    RESPOND_BUCKETS,
                  )}
                  className="flex flex-col gap-3"
                >
                  {RESPOND_BUCKETS.map((bucket) => (
                    <BucketAccordion
                      key={bucket}
                      bucket={bucket}
                      notificationId={notification.id}
                      groups={affectedAssets[bucket]}
                      variant="compact"
                    />
                  ))}
                </Accordion>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No triaged assets for this notification.
                </p>
              )}

              <NotInInventoryCard
                deviceGroupsMatchings={deviceGroupsMatchings}
              />
            </div>
          </section>
        )}

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
      </div>
    </>
  );
}
