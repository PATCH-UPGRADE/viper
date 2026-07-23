"use client";

import { Accordion } from "@/components/ui/accordion";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { MitigationPlanItem } from "@/features/mitigation/components/mitigation-plan-item";
import { useSuspenseMitigationPlans } from "@/features/mitigation/hooks/use-mitigation";
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

// NO_ISSUES (never-triaged matchings) is noise while deciding a response —
// it stays on the Affected Assets tab.
const RESPOND_BUCKETS = [
  "AFFECTED",
  "UNDER_INVESTIGATION",
  "NOT_AFFECTED",
] as const satisfies readonly Bucket[];

const COLUMN_HEADING =
  "font-semibold uppercase tracking-wide text-sm";

export function NotificationRespondTab({
  notification,
}: {
  notification: NotificationDetailWithRelations;
}) {
  const { data: plans } = useSuspenseMitigationPlans(notification.id);
  const acceptedPlan = plans.find((p) => p.isAccepted);

  const { affectedAssets, deviceGroupsMatchings } = notification;
  const hasAnyGroup = RESPOND_BUCKETS.some((b) => affectedAssets[b].length > 0);

  return (
    <>
      <HospitalImpactCard notification={notification} />
      <NotificationSummaryCard notification={notification} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] pt-2">
        {/* What's affected */}
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

          <NotInInventoryCard deviceGroupsMatchings={deviceGroupsMatchings} />
        </div>
        </section>

        {/* Choose a response plan */}
        <section className="flex flex-col gap-3">
          <h3 className={COLUMN_HEADING}>Choose a response plan</h3>

          {plans.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No response plans yet</EmptyTitle>
                <EmptyDescription>
                  No mitigation plans have been proposed for this notification.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
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
