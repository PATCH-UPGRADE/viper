"use client";

import { Accordion } from "@/components/ui/accordion";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MitigationPlanWithWorkOrders } from "../types";
import { MitigationPlanItem } from "./mitigation-plan-item";
import { MitigationPlanMatrix } from "./mitigation-plan-matrix";

export type PlanView = "list" | "matrix";

export function MitigationPlansPanel({
  plans,
  notificationId,
  isMatrix,
  onViewChange,
}: {
  plans: MitigationPlanWithWorkOrders[];
  notificationId: string;
  isMatrix: boolean;
  onViewChange: (view: PlanView) => void;
}) {
  const acceptedPlan = plans.find((p) => p.isAccepted);
  const canCompare = plans.length > 1;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold uppercase tracking-wide text-sm">
          Choose a response plan
        </h3>
        {canCompare && (
          <ToggleGroup
            type="single"
            value={isMatrix ? "matrix" : "list"}
            onValueChange={(next) => next && onViewChange(next as PlanView)}
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
        <MitigationPlanMatrix plans={plans} notificationId={notificationId} />
      ) : (
        // plans is nonempty: the Respond tab renders only when the notification has plans.
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
              notificationId={notificationId}
              hasAcceptedPlan={acceptedPlan !== undefined}
            />
          ))}
        </Accordion>
      )}
    </section>
  );
}
