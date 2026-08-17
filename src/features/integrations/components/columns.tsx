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
import { platformLabels, resourceTypeLabel } from "../types";
import { SyncStatusIndicator } from "./integrations";

type IntegrationRow = IntegrationListItem & {
  expandableResourceSyncs: IntegrationResourceSyncItem[];
};

const frequencyLabel = (sync: {
  effectiveSyncEvery: number;
  isOverridden: boolean;
}) =>
  `Every ${ms(sync.effectiveSyncEvery * 1000)}${sync.isOverridden ? "" : " (default)"}`;

const LastSynced = ({
  lastSuccessfulSync,
}: {
  lastSuccessfulSync: Date | null;
}) => (
  <Tooltip>
    <TooltipTrigger>
      {lastSuccessfulSync
        ? `${formatDistanceToNow(lastSuccessfulSync)} ago`
        : "Never"}
    </TooltipTrigger>
    <TooltipContent>
      {lastSuccessfulSync
        ? lastSuccessfulSync.toLocaleString()
        : "Never synced"}
    </TooltipContent>
  </Tooltip>
);

const SyncSummaryCell = ({ row }: { row: IntegrationListItem }) => {
  const { resourceSyncs } = row;

  if (resourceSyncs.length !== 1) {
    const activeCount = resourceSyncs.filter((s) => s.enabled).length;
    return (
      <span className="text-muted-foreground">
        {activeCount} of {resourceSyncs.length} feeds active
      </span>
    );
  }

  const sync = resourceSyncs[0];
  return (
    <div className="flex flex-col gap-0.5">
      <Tooltip>
        <TooltipTrigger>
          <SyncStatusIndicator status={sync.status} />
        </TooltipTrigger>
        {sync.status === SyncStatusEnum.Error && sync.errorMessage && (
          <TooltipContent>{sync.errorMessage}</TooltipContent>
        )}
      </Tooltip>
      <span className="text-xs text-muted-foreground">
        {frequencyLabel(sync)} ·{" "}
        <LastSynced lastSuccessfulSync={sync.lastSuccessfulSync} />
      </span>
    </div>
  );
};

export const columns: ColumnDef<IntegrationRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => <SortableHeader header="Name" column={column} />,
    cell: ({ row }) => (
      <div className="font-semibold max-w-60 overflow-ellipsis overflow-hidden">
        {row.original.name}
      </div>
    ),
  },
  {
    id: "platform",
    meta: { title: "Platform" },
    header: "Platform",
    cell: ({ row }) => platformLabels[row.original.platform],
  },
  {
    id: "resources",
    meta: { title: "Resources" },
    header: "Resources",
    cell: ({ row }) => (
      <div className="max-w-60 overflow-ellipsis overflow-hidden">
        {row.original.resourceSyncs
          .map((s) => resourceTypeLabel(s.resource))
          .join(", ")}
      </div>
    ),
  },
  {
    id: "sync",
    meta: { title: "Sync Status" },
    header: "Sync Status",
    cell: ({ row }) => <SyncSummaryCell row={row.original} />,
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
    cell: ({ row }) => resourceTypeLabel(row.original.resource),
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
    id: "lastSynced",
    header: "Last Synced",
    cell: ({ row }) => (
      <LastSynced lastSuccessfulSync={row.original.lastSuccessfulSync} />
    ),
  },
  {
    id: "frequency",
    header: "Frequency",
    cell: ({ row }) => frequencyLabel(row.original),
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
