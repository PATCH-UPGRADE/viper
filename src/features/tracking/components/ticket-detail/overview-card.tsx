"use client";

import { formatDistanceToNow } from "date-fns";
import {
  BadgeCheckIcon,
  BotIcon,
  CalendarIcon,
  ExternalLinkIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import type React from "react";
import { PriorityBadge } from "@/components/priority-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { resolveWorkOrderDetailUrl } from "@/features/integrations/teamplay-fleet/urls";
import { getChipClass } from "@/features/tag-colors/palette";
import { formatScheduled } from "@/lib/date-utils";
import type { TicketDetail } from "../../types";
import { CategoryChip, formatDate, StatusChip } from "./shared";

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
    {children}
  </span>
);

const MetaField = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <FieldLabel>{label}</FieldLabel>
    <div className="text-sm">{children}</div>
  </div>
);

const SourceHeader = ({ data }: { data: TicketDetail }) => {
  const mapping = data.externalMappings[0];
  const source = data.sources[0];
  const label = data.sourceLabel ?? mapping?.integration.name;
  const externalRef = mapping?.externalId ?? source?.externalId;

  const referenceUrl =
    source?.referenceUrl ??
    (mapping
      ? resolveWorkOrderDetailUrl(
          mapping.integration.integrationUri,
          mapping.externalId,
        )
      : null);

  // A manually created work order has no source. Do not render the block.
  if (!label && !externalRef) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>Source</FieldLabel>
      <div className="flex items-center gap-3 rounded-lg border bg-muted/60 px-3 py-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
          <BadgeCheckIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{label}</p>
          {mapping?.lastSynced && (
            <p className="text-xs text-muted-foreground">
              Last synced{" "}
              {formatDistanceToNow(new Date(mapping.lastSynced), {
                addSuffix: true,
              })}
            </p>
          )}
        </div>
        {externalRef && referenceUrl && (
          <Link
            href={referenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 font-mono text-xs hover:bg-muted"
          >
            {externalRef}
            <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
          </Link>
        )}
      </div>
    </div>
  );
};

const CreatedFooter = ({ data }: { data: TicketDetail }) => {
  // An integration work order belongs to the automation. Do not show the
  // integration user that created the record.
  const fromAutomation =
    !!data.sourceLabel ||
    data.externalMappings.length > 0 ||
    data.sources.length > 0;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        Created by{" "}
        {fromAutomation ? (
          <span className="inline-flex items-center gap-1">
            <BotIcon className="size-3.5" />
            VIPER Automation
          </span>
        ) : (
          data.creator.name
        )}
      </span>
      <span>·</span>
      <span>{formatDate(data.createdAt)}</span>
      {data.notification && (
        <>
          <span>·</span>
          <span>from</span>
          <Link
            href={`/inbox/${data.notification.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {data.notification.title ?? "advisory"}
          </Link>
        </>
      )}
    </div>
  );
};

export const OverviewCard = ({ data }: { data: TicketDetail }) => {
  return (
    <Card className="flex flex-col gap-5 p-5">
      <SourceHeader data={data} />

      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <MetaField label="Priority">
          <PriorityBadge priority={data.priority} />
        </MetaField>

        <MetaField label="Assignee">
          <div className="flex items-center gap-1.5">
            <UserIcon className="size-3.5 text-muted-foreground" />
            <span>{data.assignee?.name ?? "Unassigned"}</span>
            {data.assignee?.department && (
              <span className="text-muted-foreground">
                · {data.assignee.department.name}
              </span>
            )}
          </div>
        </MetaField>

        <MetaField label="Departments">
          {data.departments.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {data.departments.map((d) => (
                <Badge
                  key={d.id}
                  variant="outline"
                  className={getChipClass(d.color)}
                >
                  {d.name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </MetaField>

        <MetaField label="Scheduled for">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="size-3.5 text-muted-foreground" />
            {formatScheduled(data.scheduledAt) ?? "—"}
          </div>
        </MetaField>

        <MetaField label="Category">
          <CategoryChip category={data.category} />
        </MetaField>

        <MetaField label="Status">
          <StatusChip status={data.status} />
        </MetaField>
      </div>

      <CreatedFooter data={data} />
    </Card>
  );
};
