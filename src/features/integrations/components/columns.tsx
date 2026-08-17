"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { TrashIcon } from "lucide-react";
import ms from "ms";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SortableHeader } from "@/components/ui/data-table";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SyncStatusEnum } from "@/generated/prisma";
import {
  useRemoveIntegration,
  useSetIntegrationEnabled,
  useSetResourceSyncEnabled,
} from "../hooks/use-integrations";
import type {
  IntegrationListItem,
  IntegrationResourceSyncItem,
} from "../types";
import {
  categoryLabelFor,
  platformLabels,
  resourceActivityNoun,
  resourceTypeLabel,
} from "../types";
import { SyncStatusIndicator } from "./integrations";

type IntegrationRow = IntegrationListItem & {
  expandableResourceSyncs: IntegrationResourceSyncItem[];
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const frequencyLabel = (sync: {
  effectiveSyncEvery: number;
  isOverridden: boolean;
}) =>
  `Every ${ms(sync.effectiveSyncEvery * 1000)}${sync.isOverridden ? "" : " (default)"}`;

/** `formatDistanceToNow` with `addSuffix` reads "5 minutes ago" for the past
 * and "in 5 minutes" for the future — one helper covers both last-synced and
 * next-sync-due. */
const relativeTime = (date: Date) =>
  formatDistanceToNow(date, { addSuffix: true });

const activityLine = (sync: IntegrationResourceSyncItem) =>
  sync.lastSyncCreatedCount != null
    ? `${sync.lastSyncCreatedCount} ${resourceActivityNoun(sync.resource)}`
    : null;

const timingLine = (sync: IntegrationResourceSyncItem) => {
  if (!sync.lastSuccessfulSync) return "Never synced";
  const parts = [`Synced ${relativeTime(sync.lastSuccessfulSync)}`];
  if (sync.nextSyncAt && sync.enabled) {
    // A due-but-not-yet-run sync (cron hasn't ticked) reads as "Next sync
    // 5 hours ago", which looks like a typo rather than a schedule. State
    // it as overdue instead of reusing the past-tense phrasing.
    parts.push(
      sync.nextSyncAt.getTime() <= Date.now()
        ? "Sync due"
        : `Next sync ${relativeTime(sync.nextSyncAt)}`,
    );
  }
  return parts.join(" · ");
};

const SyncSummaryCell = ({ row }: { row: IntegrationListItem }) => {
  const { resourceSyncs } = row;

  if (resourceSyncs.length > 1) {
    const enabledCount = resourceSyncs.filter((s) => s.enabled).length;
    return (
      <div className="text-xs text-muted-foreground">
        {enabledCount} of {resourceSyncs.length} feeds active
      </div>
    );
  }

  const sync = resourceSyncs[0];
  if (!sync) return null;
  const activity = activityLine(sync);

  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {activity && <span>{activity}</span>}
      <span>
        {frequencyLabel(sync)} · {timingLine(sync)}
      </span>
    </div>
  );
};

export const columns: ColumnDef<IntegrationRow>[] = [
  {
    id: "integration",
    accessorKey: "name",
    header: ({ column }) => (
      <SortableHeader header="Integration" column={column} />
    ),
    cell: ({ row }) => {
      const integration = row.original;
      const category = categoryLabelFor(
        integration.platform,
        integration.resourceSyncs.map((s) => s.resource),
      );
      return (
        <div className="flex items-start gap-3">
          <Avatar className="size-8 shrink-0 border">
            <AvatarFallback className="bg-accent text-accent-foreground text-xs font-semibold">
              {initialsOf(integration.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="font-semibold overflow-ellipsis overflow-hidden">
              {integration.name}
              <span className="font-normal text-muted-foreground">
                {" "}
                · {platformLabels[integration.platform]}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{category}</span>
            <SyncSummaryCell row={integration} />
          </div>
        </div>
      );
    },
  },
  {
    id: "status",
    meta: { title: "Status" },
    header: "Status",
    cell: ({ row }) => {
      const { resourceSyncs } = row.original;
      if (resourceSyncs.length !== 1) return null;
      const sync = resourceSyncs[0];
      return (
        <Tooltip>
          <TooltipTrigger>
            <SyncStatusIndicator status={sync.status} />
          </TooltipTrigger>
          {sync.status === SyncStatusEnum.Error && sync.errorMessage && (
            <TooltipContent>{sync.errorMessage}</TooltipContent>
          )}
        </Tooltip>
      );
    },
  },
  {
    id: "enabled",
    meta: { title: "Enabled" },
    header: "Enabled",
    cell: ({ row }) => {
      const setEnabled = useSetIntegrationEnabled();
      return (
        <Switch
          checked={row.original.enabled}
          disabled={setEnabled.isPending}
          onCheckedChange={(enabled) =>
            setEnabled.mutate({ id: row.original.id, enabled })
          }
          aria-label={`${row.original.enabled ? "Disable" : "Enable"} ${row.original.name}`}
        />
      );
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const data = row.original;
      const removeItem = useRemoveIntegration();
      const [confirmOpen, setConfirmOpen] = useState(false);

      return (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => setConfirmOpen(true)}
              >
                <span className="sr-only">Remove Integration</span>
                <TrashIcon className="h-4 w-4 text-destructive" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove Integration</TooltipContent>
          </Tooltip>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove integration?</AlertDialogTitle>
                <AlertDialogDescription>
                  This stops <strong>{data.name}</strong> from syncing and
                  removes it entirely. This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await removeItem.mutateAsync({ id: data.id });
                    setConfirmOpen(false);
                  }}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      );
    },
  },
];

export const resourceColumns: ColumnDef<IntegrationResourceSyncItem>[] = [
  {
    id: "resource",
    header: "Resource",
    cell: ({ row }) => {
      const sync = row.original;
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">
            {resourceTypeLabel(sync.resource)}
          </span>
          {sync.enabled ? (
            <span className="text-xs text-muted-foreground">
              {activityLine(sync) && `${activityLine(sync)} · `}
              {frequencyLabel(sync)} · {timingLine(sync)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Disabled</span>
          )}
        </div>
      );
    },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const sync = row.original;
      return (
        <Tooltip>
          <TooltipTrigger>
            <SyncStatusIndicator status={sync.status} />
          </TooltipTrigger>
          {sync.status === SyncStatusEnum.Error && sync.errorMessage && (
            <TooltipContent>{sync.errorMessage}</TooltipContent>
          )}
        </Tooltip>
      );
    },
  },
  {
    id: "enabled",
    header: "Enabled",
    cell: ({ row }) => {
      const sync = row.original;
      const setResourceEnabled = useSetResourceSyncEnabled();
      return (
        <Switch
          checked={sync.enabled}
          disabled={setResourceEnabled.isPending}
          onCheckedChange={(enabled) =>
            setResourceEnabled.mutate({
              integrationId: sync.integrationId,
              resource: sync.resource,
              enabled,
            })
          }
          aria-label={`${sync.enabled ? "Disable" : "Enable"} ${resourceTypeLabel(sync.resource)} sync`}
        />
      );
    },
  },
];
