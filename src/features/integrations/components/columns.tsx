"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, TrashIcon } from "lucide-react";
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
  useTriggerSync,
} from "../hooks/use-integrations";
import type {
  IntegrationListItem,
  IntegrationResourceSyncItem,
} from "../types";
import { platformLabels, resourceTypeLabel } from "../types";
import { SyncStatusIndicator } from "./integrations";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
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

const timingLine = (sync: IntegrationResourceSyncItem) => {
  if (!sync.lastSuccessfulSync) return "Never synced";
  const parts = [`Synced ${relativeTime(sync.lastSuccessfulSync)}`];
  if (sync.nextSyncAt && sync.enabled) {
    // A due-but-not-yet-run sync (cron hasn't ticked) reads as "Next sync
    // 5 hours ago", which looks like a typo rather than a schedule. State
    // it as overdue instead of reusing the past-tense phrasing. `isDue` is
    // computed server-side (same check the cron itself uses) rather than
    // compared against the browser's clock.
    parts.push(
      sync.isDue ? "Sync due" : `Next sync ${relativeTime(sync.nextSyncAt)}`,
    );
  }
  return parts.join(" · ");
};

const StatusCell = ({
  sync,
}: {
  sync: Pick<IntegrationResourceSyncItem, "status" | "errorMessage">;
}) => (
  <Tooltip>
    <TooltipTrigger>
      <SyncStatusIndicator status={sync.status} />
    </TooltipTrigger>
    {sync.status === SyncStatusEnum.Error && sync.errorMessage && (
      <TooltipContent>{sync.errorMessage}</TooltipContent>
    )}
  </Tooltip>
);

const SyncSummaryCell = ({ row }: { row: IntegrationListItem }) => {
  const { resourceSyncs } = row;

  if (resourceSyncs.length > 1) {
    // The integration's own kill switch overrides every resource's flag —
    // don't report feeds as active when the whole integration is off.
    const enabledCount = row.enabled
      ? resourceSyncs.filter((s) => s.enabled).length
      : 0;
    return (
      <div className="text-xs text-muted-foreground">
        {enabledCount} of {resourceSyncs.length} feeds active
      </div>
    );
  }

  const sync = resourceSyncs[0];
  if (!sync) return null;
  if (!row.enabled) {
    return <div className="text-xs text-muted-foreground">Disabled</div>;
  }

  return (
    <div className="text-xs text-muted-foreground">
      {frequencyLabel(sync)} · {timingLine(sync)}
    </div>
  );
};

export const columns: ColumnDef<IntegrationListItem>[] = [
  {
    id: "integration",
    accessorKey: "name",
    header: "Integration",
    cell: ({ row }) => {
      const integration = row.original;
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
      const integration = row.original;
      if (integration.resourceSyncs.length !== 1) return null;
      return <StatusCell sync={integration.resourceSyncs[0]} />;
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
      const triggerSync = useTriggerSync();
      const [confirmOpen, setConfirmOpen] = useState(false);

      return (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0"
                disabled={
                  triggerSync.isPending ||
                  !data.enabled ||
                  !data.resourceSyncs.some((sync) => sync.enabled)
                }
                onClick={() => triggerSync.mutate({ id: data.id })}
              >
                <span className="sr-only">Sync Now</span>
                <RefreshCw
                  className={`h-4 w-4 ${triggerSync.isPending ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sync Now</TooltipContent>
          </Tooltip>

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
                  disabled={removeItem.isPending}
                  onClick={async (event) => {
                    event.preventDefault();
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
    cell: ({ row }) => <StatusCell sync={row.original} />,
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
