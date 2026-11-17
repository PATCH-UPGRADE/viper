"use client";

import {
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RefreshCw,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { MoreVerticalDropdownMenu } from "@/components/ui/dropdown-menu";
import type { CatalogEntry } from "../core/catalog";
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
import { isPaused, streamName } from "./connector-status";
import { IntegrationFormDialog } from "./create-integration-dialog";

const INTEGRATION_MENU_LABELS = {
  edit: "Edit Integration",
  remove: "Remove Integration",
  confirmTitle: "Remove integration?",
};

const UPLOAD_MENU_LABELS = {
  edit: "Edit Name",
  remove: "Remove",
  confirmTitle: "Remove upload?",
};

const pauseItem = ({
  paused,
  disabled,
  description,
  onToggle,
}: {
  paused: boolean;
  disabled: boolean;
  description?: string;
  onToggle: () => void;
}) => ({
  label: paused ? "Resume Sync" : "Pause Sync",
  description,
  icon: paused ? <PlayIcon /> : <PauseIcon />,
  onClick: onToggle,
  disabled,
});

const toastPauseToggled = (name: string, resumed: boolean) =>
  toast.success(
    `${name} ${resumed ? "resumed" : "paused. Its settings and records are kept"}.`,
  );

export const IntegrationActionsMenu = ({
  integration,
  catalogEntry,
}: {
  integration: IntegrationListItem;
  catalogEntry?: CatalogEntry;
}) => {
  const removeItem = useRemoveIntegration();
  const triggerSync = useTriggerSync();
  const setEnabled = useSetIntegrationEnabled();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const canSync =
    integration.enabled && integration.resourceSyncs.some((s) => s.enabled);
  const syncsOnSchedule = !catalogEntry?.unscheduled;
  const labels = syncsOnSchedule ? INTEGRATION_MENU_LABELS : UPLOAD_MENU_LABELS;

  // Paused also covers "on, but every stream is off", so the menu always matches the status
  // badge. Resuming such an integration resumes all of its streams (see `setEnabled`).
  const paused = isPaused(integration);
  const togglePaused = () => {
    const enabled = paused;
    setEnabled.mutate(
      { id: integration.id, enabled },
      { onSuccess: () => toastPauseToggled(integration.name, enabled) },
    );
  };

  return (
    <>
      <MoreVerticalDropdownMenu
        items={[
          syncsOnSchedule && {
            label: triggerSync.isPending ? "Syncing..." : "Sync Now",
            icon: (
              <RefreshCw
                className={triggerSync.isPending ? "animate-spin" : ""}
              />
            ),
            onClick: () => triggerSync.mutate({ id: integration.id }),
            disabled: triggerSync.isPending || !canSync,
          },
          catalogEntry && {
            label: labels.edit,
            icon: <PencilIcon />,
            onClick: () => setEditOpen(true),
          },
          syncsOnSchedule &&
            pauseItem({
              paused,
              disabled: setEnabled.isPending,
              onToggle: togglePaused,
            }),
          {
            label: labels.remove,
            icon: <TrashIcon />,
            onClick: () => setConfirmOpen(true),
            variant: "destructive",
          },
        ]}
      />

      {catalogEntry && (
        <IntegrationFormDialog
          entry={catalogEntry}
          mode="edit"
          integration={integration}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.confirmTitle}</AlertDialogTitle>
            {syncsOnSchedule ? (
              <AlertDialogDescription>
                This stops <strong>{integration.name}</strong> from syncing and
                removes it entirely. This can&apos;t be undone.
              </AlertDialogDescription>
            ) : (
              <AlertDialogDescription>
                This removes <strong>{integration.name}</strong> from your
                uploads. The devices it added stay in VIPER, but are no longer
                linked to this upload. This can&apos;t be undone.
              </AlertDialogDescription>
            )}
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

/**
 * A stream's own pause switch. While the whole integration is switched off, the stream cannot
 * be resumed on its own, and the menu item says to resume the integration first.
 */
export const StreamActionsMenu = ({
  integration,
  sync,
}: {
  integration: IntegrationListItem;
  sync: IntegrationResourceSyncItem;
}) => {
  const setResourceEnabled = useSetResourceSyncEnabled();
  const name = `${integration.name} · ${streamName(sync.resource)}`;

  return (
    <MoreVerticalDropdownMenu
      items={[
        pauseItem({
          paused: !integration.enabled || !sync.enabled,
          disabled: setResourceEnabled.isPending || !integration.enabled,
          description: integration.enabled
            ? undefined
            : `Resume ${integration.name} first`,
          onToggle: () => {
            const enabled = !sync.enabled;
            setResourceEnabled.mutate(
              {
                integrationId: sync.integrationId,
                resource: sync.resource,
                enabled,
              },
              { onSuccess: () => toastPauseToggled(name, enabled) },
            );
          },
        }),
      ]}
    />
  );
};
