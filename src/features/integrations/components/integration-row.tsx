"use client";

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
import { MoreVerticalDropdownMenu } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ResourceType, SyncStatusEnum } from "@/generated/prisma";
import { initialsOf } from "@/lib/string-utils";
import { cn } from "@/lib/utils";
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
import { resourceTypeLabel } from "../types";

export const CATEGORIES = [
  "Hospital Inventory",
  "Vulnerability Management Platforms",
  "Ticketing Platforms",
  "Vendor Platforms",
  "Notifications",
] as const;

// No real "category" field exists — this infers one from what's synced.
// Revisit if a real category field ever lands.
export const categoryLabel = (
  integration: IntegrationListItem,
): (typeof CATEGORIES)[number] => {
  if (integration.resourceSyncs.length > 1) return "Vendor Platforms";
  switch (integration.resourceSyncs[0]?.resource) {
    case ResourceType.Vulnerability:
      return "Vulnerability Management Platforms";
    case ResourceType.WorkOrder:
      return "Ticketing Platforms";
    case ResourceType.SourceRecord:
      return "Notifications";
    default:
      return "Hospital Inventory";
  }
};

const frequencyLabel = (sync: {
  effectiveSyncEvery: number;
  isOverridden: boolean;
}) =>
  `Every ${ms(sync.effectiveSyncEvery * 1000)}${sync.isOverridden ? "" : " (default)"}`;

const relativeTime = (date: Date) =>
  formatDistanceToNow(date, { addSuffix: true });

type TimingInput = Pick<
  IntegrationResourceSyncItem,
  | "status"
  | "errorMessage"
  | "lastAttemptAt"
  | "lastSuccessfulSync"
  | "nextSyncAt"
  | "isDue"
>;

const nextSyncLabel = (sync: TimingInput): string | null =>
  sync.isDue
    ? "Sync due"
    : sync.nextSyncAt
      ? `Next sync ${relativeTime(sync.nextSyncAt)}`
      : null;

export const timingLine = (sync: TimingInput) => {
  if (sync.status === SyncStatusEnum.Error) {
    const when = sync.lastAttemptAt ?? sync.lastSuccessfulSync;
    return {
      text: when ? `Failed synced ${relativeTime(when)}` : "Sync failed",
      isError: true,
    };
  }
  const next = nextSyncLabel(sync);
  if (!sync.lastSuccessfulSync) {
    return { text: next ?? "Never synced", isError: false };
  }
  const parts = [`Synced ${relativeTime(sync.lastSuccessfulSync)}`];
  if (next) parts.push(next);
  return { text: parts.join(" · "), isError: false };
};

/** Most-recent success, soonest next sync, any-error, across a set of resource syncs. */
export const aggregateTiming = (
  resourceSyncs: IntegrationResourceSyncItem[],
): TimingInput | null => {
  const enabled = resourceSyncs.filter((s) => s.enabled);
  if (enabled.length === 0) return null;

  const pick = (dates: (Date | null)[], dir: 1 | -1) => {
    const ts = dates
      .filter((d): d is Date => d != null)
      .map((d) => d.getTime());
    return ts.length
      ? new Date(dir === 1 ? Math.min(...ts) : Math.max(...ts))
      : null;
  };

  const failing = enabled.find((s) => s.status === SyncStatusEnum.Error);
  const timingSource = failing ? [failing] : enabled;
  return {
    status: failing ? SyncStatusEnum.Error : SyncStatusEnum.Success,
    errorMessage: failing?.errorMessage ?? null,
    lastAttemptAt: pick(
      timingSource.map((s) => s.lastAttemptAt),
      -1,
    ),
    lastSuccessfulSync: pick(
      timingSource.map((s) => s.lastSuccessfulSync),
      -1,
    ),
    nextSyncAt: pick(
      enabled.map((s) => s.nextSyncAt),
      1,
    ),
    isDue: enabled.some((s) => s.isDue),
  };
};

const TimingText = ({
  timing,
  prefix,
}: {
  timing: TimingInput;
  prefix?: string;
}) => {
  const { text, isError } = timingLine(timing);
  const label = (
    <span
      className={cn(
        "inline-flex items-center text-xs",
        isError ? "text-destructive font-medium" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "inline-block size-1.5 rounded-full mr-1.5",
          timing.status === SyncStatusEnum.Error
            ? "bg-destructive"
            : timing.lastSuccessfulSync
              ? "bg-emerald-500"
              : "bg-muted-foreground/40",
        )}
      />
      {prefix ? `${prefix} · ${text}` : text}
    </span>
  );

  if (!isError || !timing.errorMessage) return label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{label}</TooltipTrigger>
      <TooltipContent>{timing.errorMessage}</TooltipContent>
    </Tooltip>
  );
};

// `block` renders the two-line header form; otherwise the inline nested-row form.
const ResourceStatus = ({
  sync,
  integrationEnabled,
  block,
}: {
  sync: IntegrationResourceSyncItem;
  integrationEnabled: boolean;
  block?: boolean;
}) => {
  const size = block ? "text-sm" : "text-xs";
  if (!integrationEnabled || !sync.enabled) {
    return <span className={cn("text-muted-foreground", size)}>Disabled</span>;
  }
  if (!block) return <TimingText timing={sync} prefix={frequencyLabel(sync)} />;
  return (
    <div className="text-right">
      <div
        className={cn("flex items-center justify-end gap-1 font-medium", size)}
      >
        <RefreshCw className="size-3.5 text-muted-foreground" />
        {frequencyLabel(sync)}
      </div>
      <TimingText timing={sync} />
    </div>
  );
};

const IntegrationActionsMenu = ({
  integration,
}: {
  integration: IntegrationListItem;
}) => {
  const removeItem = useRemoveIntegration();
  const triggerSync = useTriggerSync();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canSync =
    integration.enabled && integration.resourceSyncs.some((s) => s.enabled);

  return (
    <>
      <MoreVerticalDropdownMenu
        items={[
          {
            label: triggerSync.isPending ? "Syncing..." : "Sync Now",
            icon: (
              <RefreshCw
                className={triggerSync.isPending ? "animate-spin" : ""}
              />
            ),
            onClick: () => triggerSync.mutate({ id: integration.id }),
            disabled: triggerSync.isPending || !canSync,
          },
          {
            label: "Remove Integration",
            icon: <TrashIcon />,
            onClick: () => setConfirmOpen(true),
            variant: "destructive",
          },
        ]}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove integration?</AlertDialogTitle>
            <AlertDialogDescription>
              This stops <strong>{integration.name}</strong> from syncing and
              removes it entirely. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeItem.isPending}
              onClick={(event) => {
                event.preventDefault();
                removeItem.mutate(
                  { id: integration.id },
                  { onSuccess: () => setConfirmOpen(false) },
                );
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const IntegrationHeaderRow = ({
  integration,
}: {
  integration: IntegrationListItem;
}) => {
  const setEnabled = useSetIntegrationEnabled();
  const singleSync =
    integration.resourceSyncs.length === 1
      ? integration.resourceSyncs[0]
      : null;
  const aggregate =
    singleSync || !integration.enabled
      ? null
      : aggregateTiming(integration.resourceSyncs);

  return (
    <div className="flex items-center gap-3 p-4">
      <Avatar className="size-9 shrink-0 rounded-md border">
        <AvatarFallback className="rounded-md bg-accent text-accent-foreground text-xs font-semibold">
          {initialsOf(integration.name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="font-semibold overflow-ellipsis overflow-hidden">
          {integration.name}
          <span className="font-normal text-muted-foreground">
            {" "}
            · {integration.platformLabel}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {categoryLabel(integration)}
        </div>
        {aggregate && <TimingText timing={aggregate} />}
      </div>

      {singleSync && (
        <ResourceStatus
          sync={singleSync}
          integrationEnabled={integration.enabled}
          block
        />
      )}

      <Switch
        checked={integration.enabled}
        disabled={setEnabled.isPending}
        onCheckedChange={(enabled) =>
          setEnabled.mutate({ id: integration.id, enabled })
        }
        aria-label={`${integration.enabled ? "Disable" : "Enable"} ${integration.name}`}
      />

      <IntegrationActionsMenu integration={integration} />
    </div>
  );
};

const ResourceRow = ({
  sync,
  integrationEnabled,
}: {
  sync: IntegrationResourceSyncItem;
  integrationEnabled: boolean;
}) => {
  const setResourceEnabled = useSetResourceSyncEnabled();
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex-1 text-sm font-medium">
        {resourceTypeLabel(sync.resource)}
      </span>
      <ResourceStatus sync={sync} integrationEnabled={integrationEnabled} />
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
    </div>
  );
};

export const IntegrationCard = ({
  integration,
}: {
  integration: IntegrationListItem;
}) => (
  <>
    <IntegrationHeaderRow integration={integration} />
    {integration.resourceSyncs.length > 1 && (
      <div className="mx-4 mb-3 rounded-lg border divide-y">
        {integration.resourceSyncs.map((sync) => (
          <ResourceRow
            key={sync.resource}
            sync={sync}
            integrationEnabled={integration.enabled}
          />
        ))}
      </div>
    )}
  </>
);
