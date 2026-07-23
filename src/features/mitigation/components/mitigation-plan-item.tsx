"use client";

import {
  CheckIcon,
  ExternalLinkIcon,
  SquarePenIcon,
  StarIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { planCardsSchema } from "@/features/inbox/agent/mitigation/schema";
import { CategoryChip } from "@/features/tracking/components/ticket-detail/shared";
import { cn } from "@/lib/utils";
import type { MitigationPlanWithWorkOrders } from "../types";
import { AcceptPlanDrawer } from "./accept-plan-drawer";
import { planCardFields, planTagLabels } from "./shared";

export function MitigationPlanItem({
  plan,
  notificationId,
  hasAcceptedPlan,
}: {
  plan: MitigationPlanWithWorkOrders;
  notificationId: string;
  /** True when some plan on this notification is already accepted. */
  hasAcceptedPlan: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const cardsParse = planCardsSchema.safeParse(plan.cards);
  const cards = cardsParse.success ? cardsParse.data : null;
  const isRecommended = plan.order === 0;
  const workOrderCount = plan.workOrders.length;
  // Another plan won — this one can no longer be accepted.
  const isLockedOut = hasAcceptedPlan && !plan.isAccepted;

  const banner = plan.isAccepted ? (
    <>
      <CheckIcon className="size-3.5" />
      <span>Accepted</span>
      <span>&bull;</span>
      <Link
        href="/tracking"
        className="flex items-center gap-1 normal-case hover:underline"
      >
        View work orders
        <ExternalLinkIcon className="size-3.5" />
      </Link>
    </>
  ) : isRecommended ? (
    <>
      <StarIcon className="size-3.5" />
      Recommended
    </>
  ) : null;

  return (
    <Card
      className={cn(
        "overflow-hidden py-0 gap-0",
        plan.isAccepted && "border-primary",
        isRecommended && !hasAcceptedPlan && "border-primary",
        isLockedOut && "opacity-70",
      )}
    >
      {banner && (
        <div className="flex items-center gap-2 border-b bg-primary/10 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-primary">
          {banner}
        </div>
      )}

      <AccordionItem value={plan.id} className="border-b-0">
        <AccordionTrigger className="items-center bg-muted px-6">
          <div className="flex items-start gap-3">
            <Badge
              variant={isRecommended ? "default" : "secondary"}
              className="size-6 justify-center rounded-md mt-1 text-sm"
            >
              {plan.order + 1}
            </Badge>
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold">{plan.title}</span>
              {plan.compareLine && (
                <span className="text-sm font-normal text-muted-foreground">
                  {plan.compareLine}
                </span>
              )}
            </div>
          </div>
        </AccordionTrigger>

        <AccordionContent className="flex flex-col gap-4 pb-6 px-6 pt-4">
          {/* Tags */}
          {plan.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {plan.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {planTagLabels[tag]}
                </Badge>
              ))}
            </div>
          )}

          {/* Summary */}
          <p className="text-sm leading-relaxed text-muted-foreground">
            {plan.summary}
          </p>

          {/* Cards */}
          {cards && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {planCardFields.map(([field, label]) => (
                <div key={field} className="rounded-lg border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {cards[field] || "—"}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Work orders */}
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {plan.isAccepted
              ? `This plan created ${workOrderCount} work item${workOrderCount === 1 ? "" : "s"}`
              : `Accepting this plan creates ${workOrderCount} work item${workOrderCount === 1 ? "" : "s"}`}
          </p>
          <div className="flex flex-col gap-2">
            {plan.workOrders.map((workOrder) => {
              const meta = [
                workOrder.sourceLabel,
                ...workOrder.departments.map((d) => d.name),
                workOrder.assignee?.name ?? workOrder.suggestedAssignee,
              ].filter((v): v is string => Boolean(v));

              const row = (
                <>
                  <SquarePenIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-medium">{workOrder.summary}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <CategoryChip category={workOrder.category} />
                      {meta.join(" · ")}
                    </span>
                  </div>
                  {plan.isAccepted && (
                    <ExternalLinkIcon className="ml-auto mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                </>
              );

              return plan.isAccepted ? (
                <Link
                  key={workOrder.id}
                  href={`/tracking/${workOrder.id}`}
                  className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                >
                  {row}
                </Link>
              ) : (
                <div
                  key={workOrder.id}
                  className="flex w-full items-start gap-3 rounded-lg border p-3"
                >
                  {row}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {!plan.isAccepted && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => setDrawerOpen(true)}
                disabled={isLockedOut || workOrderCount === 0}
              >
                <SquarePenIcon className="size-4" />
                Review &amp; accept plan
              </Button>
              <span className="text-sm text-muted-foreground">
                {isLockedOut
                  ? "Another plan has already been accepted."
                  : "You'll review each draft before anything is created."}
              </span>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>

      <AcceptPlanDrawer
        plan={plan}
        notificationId={notificationId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </Card>
  );
}
