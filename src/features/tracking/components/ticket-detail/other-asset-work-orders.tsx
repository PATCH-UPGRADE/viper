"use client";

import { CalendarIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatScheduled } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { OtherAssetWorkOrder } from "../../types";
import {
  assetLabelsById,
  groupByAsset,
  groupByTeam,
  NO_TEAM_LABEL,
  type WorkOrderGroup,
} from "./other-work-order-groups";
import { type DetailAssetTicket, StatusChip } from "./shared";

const VISIBLE_ROWS = 5;
// A work order can span every linked asset. Past a handful the chips wrap into
// a wall that buries the summary, so the rest collapse into a "+N more" hint.
const VISIBLE_CHIPS = 4;

const MODES = [
  { value: "asset", label: "By asset" },
  { value: "team", label: "By team" },
] as const;
type GroupMode = (typeof MODES)[number]["value"];

const WorkOrderRow = ({
  workOrder,
  assetLabels,
}: {
  workOrder: OtherAssetWorkOrder;
  assetLabels?: Record<string, string>;
}) => {
  const teams =
    workOrder.departments.map((d) => d.name).join(", ") || NO_TEAM_LABEL;
  const visibleAssetIds = workOrder.assetIds.slice(0, VISIBLE_CHIPS);
  const hiddenAssetIds = workOrder.assetIds.slice(VISIBLE_CHIPS);
  const label = (assetId: string) => assetLabels?.[assetId] ?? assetId;

  return (
    <div className="flex items-start gap-3 border-t px-4 py-3 first:border-t-0 hover:bg-muted/40">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={`/tracking/${workOrder.id}`}
          title={workOrder.summary}
          className="truncate text-sm font-medium hover:underline"
        >
          {workOrder.summary}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">{teams}</span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarIcon className="size-3.5" aria-hidden="true" />
            {formatScheduled(workOrder.scheduledAt) ?? "Not scheduled"}
          </span>
          {assetLabels && (
            <>
              {visibleAssetIds.map((assetId) => (
                <Badge
                  key={assetId}
                  variant="secondary"
                  className="font-mono text-[11px] dark:bg-accent"
                >
                  {label(assetId)}
                </Badge>
              ))}
              {hiddenAssetIds.length > 0 && (
                <span title={hiddenAssetIds.map(label).join(", ")}>
                  +{hiddenAssetIds.length} more
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <StatusChip status={workOrder.status} className="shrink-0" />
    </div>
  );
};

const WorkOrderGroupRows = ({
  group,
  assetLabels,
}: {
  group: WorkOrderGroup;
  assetLabels?: Record<string, string>;
}) => {
  // Per group, so expanding one does not expand the rest.
  const [showAll, setShowAll] = useState(false);

  const hidden = group.workOrders.length - VISIBLE_ROWS;
  const shown = showAll
    ? group.workOrders
    : group.workOrders.slice(0, VISIBLE_ROWS);

  return (
    <>
      {shown.map((workOrder) => (
        <WorkOrderRow
          key={workOrder.id}
          workOrder={workOrder}
          assetLabels={assetLabels}
        />
      ))}
      {hidden > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start rounded-none border-t text-primary"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show fewer" : `Show ${hidden} more`}
        </Button>
      )}
    </>
  );
};

export const OtherAssetWorkOrdersCard = ({
  assetTickets,
  workOrders,
}: {
  assetTickets: DetailAssetTicket[];
  workOrders: OtherAssetWorkOrder[];
}) => {
  const [mode, setMode] = useState<GroupMode>("asset");

  const groups =
    mode === "asset"
      ? groupByAsset(assetTickets, workOrders)
      : groupByTeam(workOrders);
  const assetLabels =
    mode === "team" ? assetLabelsById(assetTickets) : undefined;

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            Other active work orders on these assets{" "}
            <span className="text-muted-foreground">({workOrders.length})</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Open work orders from any team that touch the assets linked here.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={mode}
          // Radix emits "" when the active item is clicked again.
          onValueChange={(next) => next && setMode(next as GroupMode)}
          aria-label="Group other work orders"
          className="h-9 shrink-0 rounded-lg bg-accent p-[3px] dark:bg-background"
        >
          {MODES.map(({ value, label }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="h-full rounded-md border border-transparent px-4 text-foreground/60 hover:bg-transparent hover:text-foreground data-[state=on]:border-border data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:border-input dark:data-[state=on]:bg-input"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="p-2">
        {groups.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No other open work orders touch these assets.
          </p>
        ) : (
          <Accordion
            // Remounts on a mode switch so the uncontrolled open state and
            // each group's "show more" state reset with the new grouping.
            key={mode}
            type="multiple"
            defaultValue={[groups[0].key]}
            className="flex flex-col gap-2"
          >
            {groups.map((group) => (
              <AccordionItem
                key={group.key}
                value={group.key}
                className="overflow-hidden rounded-lg border border-b"
              >
                <AccordionTrigger className="items-center bg-muted px-4 py-3 hover:no-underline dark:bg-background">
                  <div className="flex w-full items-center gap-2.5">
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        mode === "asset" && "font-mono",
                      )}
                    >
                      {group.label}
                    </span>
                    {group.subLabel && (
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        {group.subLabel}
                      </span>
                    )}
                    <Badge
                      variant="secondary"
                      className="ml-auto shrink-0 dark:bg-accent"
                    >
                      {group.workOrders.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-0">
                  <WorkOrderGroupRows group={group} assetLabels={assetLabels} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </Card>
  );
};
