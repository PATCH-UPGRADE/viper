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
  HospitalImpactCard,
  NotificationSummaryCard,
} from "./notification-impact-cards";

export function NotificationRespondTab({
  notification,
}: {
  notification: NotificationDetailWithRelations;
}) {
  const { data: plans } = useSuspenseMitigationPlans(notification.id);
  const acceptedPlan = plans.find((p) => p.isAccepted);

  return (
    <>
      <HospitalImpactCard notification={notification} />
      <NotificationSummaryCard notification={notification} />

      <h3 className="mt-2 text-lg font-semibold tracking-tight">
        Choose a Mitigation Plan
      </h3>

      {plans.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No mitigation plans yet</EmptyTitle>
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
    </>
  );
}
