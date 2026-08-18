"use client";

import { CheckIcon, ExternalLinkIcon, SquarePenIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { planCardsSchema } from "@/features/inbox/agent/mitigation/schema";
import { cn } from "@/lib/utils";
import type { MitigationPlanWithWorkOrders } from "../types";
import { AcceptPlanDrawer } from "./accept-plan-drawer";
import {
  planCardFields,
  residualRiskTone,
  riskToneClass,
  rollbackToneClass,
} from "./shared";

const ROW_LABEL =
  "w-48 px-4 py-4 align-top text-xs font-medium uppercase tracking-wide text-muted-foreground";
const CELL = "px-4 py-4 align-top text-sm whitespace-normal";

const ROW_LABEL_REM = 12;
const MIN_PLAN_COLUMN_REM = 16;

export function MitigationPlanMatrix({
  plans,
  notificationId,
}: {
  plans: MitigationPlanWithWorkOrders[];
  notificationId: string;
}) {
  const [drawerPlanId, setDrawerPlanId] = useState<string | null>(null);

  const hasAcceptedPlan = plans.some((plan) => plan.isAccepted);
  const columns = plans.map((plan) => {
    const parsed = planCardsSchema.safeParse(plan.cards);
    const isRecommended = plan.order === 0;
    return {
      plan,
      cards: parsed.success ? parsed.data : null,
      isRecommended,
      isHighlighted: plan.isAccepted || (isRecommended && !hasAcceptedPlan),
    };
  });
  const drawerPlan = plans.find((plan) => plan.id === drawerPlanId);

  const tint = (isHighlighted: boolean) =>
    isHighlighted ? "bg-primary/5" : undefined;

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        {/* table-fixed so 2 and 3 plans each split the width evenly, not by content. */}
        <Table
          className="table-fixed"
          style={{
            minWidth: `${ROW_LABEL_REM + plans.length * MIN_PLAN_COLUMN_REM}rem`,
          }}
        >
          <TableHeader>
            <TableRow>
              <TableHead className={ROW_LABEL} />
              {columns.map(({ plan, isRecommended, isHighlighted }) => (
                <TableHead
                  key={plan.id}
                  scope="col"
                  className={cn(CELL, "py-3", tint(isHighlighted))}
                >
                  <span className="flex items-center gap-2">
                    <Badge
                      variant={isRecommended ? "default" : "secondary"}
                      className="size-6 justify-center rounded-md text-sm"
                    >
                      {plan.order + 1}
                    </Badge>
                    {isRecommended && (
                      <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Recommended
                      </span>
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow>
              <TableHead scope="row" className={ROW_LABEL}>
                Plan
              </TableHead>
              {columns.map(({ plan, isHighlighted }) => (
                <TableCell
                  key={plan.id}
                  className={cn(CELL, "font-semibold", tint(isHighlighted))}
                >
                  {plan.title}
                </TableCell>
              ))}
            </TableRow>

            {planCardFields.map(([field, label]) => (
              <TableRow key={field}>
                <TableHead scope="row" className={ROW_LABEL}>
                  {label}
                </TableHead>
                {columns.map(({ plan, cards, isHighlighted }) => (
                  <TableCell
                    key={plan.id}
                    className={cn(
                      CELL,
                      tint(isHighlighted),
                      field === "residual_risk" &&
                        cn(
                          "font-semibold",
                          riskToneClass[residualRiskTone(cards?.[field])],
                        ),
                    )}
                  >
                    {field === "rollback" && cards?.rollback_level ? (
                      <>
                        <span
                          className={cn(
                            "font-semibold",
                            rollbackToneClass[cards.rollback_level],
                          )}
                        >
                          {cards.rollback_level}
                        </span>
                        {cards.rollback ? ` — ${cards.rollback}` : null}
                      </>
                    ) : (
                      cards?.[field] || "—"
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}

            <TableRow>
              <TableHead scope="row" className={ROW_LABEL}>
                Work items
              </TableHead>
              {columns.map(({ plan, isHighlighted }) => (
                <TableCell
                  key={plan.id}
                  className={cn(CELL, tint(isHighlighted))}
                >
                  <ul className="flex list-disc flex-col gap-1.5 pl-4">
                    {plan.workOrders.map((workOrder) => (
                      <li key={workOrder.id}>{workOrder.summary}</li>
                    ))}
                  </ul>
                </TableCell>
              ))}
            </TableRow>

            <TableRow>
              <TableCell className={ROW_LABEL} />
              {columns.map(({ plan, isRecommended, isHighlighted }) => (
                <TableCell
                  key={plan.id}
                  className={cn(CELL, tint(isHighlighted))}
                >
                  {plan.isAccepted ? (
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5 font-semibold text-primary">
                        <CheckIcon className="size-4" />
                        Plan accepted
                      </span>
                      <Link
                        href="/tracking"
                        className="flex items-center gap-1 text-muted-foreground hover:underline"
                      >
                        Track in work orders
                        <ExternalLinkIcon className="size-3.5" />
                      </Link>
                    </span>
                  ) : (
                    <Button
                      variant={isRecommended ? "default" : "outline"}
                      className="w-full"
                      disabled={hasAcceptedPlan || plan.workOrders.length === 0}
                      onClick={() => setDrawerPlanId(plan.id)}
                    >
                      <SquarePenIcon className="size-4" />
                      Review &amp; accept
                    </Button>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {drawerPlan && (
        <AcceptPlanDrawer
          plan={drawerPlan}
          notificationId={notificationId}
          open
          onOpenChange={(open) => {
            if (!open) setDrawerPlanId(null);
          }}
        />
      )}
    </>
  );
}
