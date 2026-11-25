"use client";

import { CheckIcon, ChevronRightIcon, PencilIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { plural } from "@/lib/utils";
import type { CatalogEntry } from "../core/catalog";
import { usePlatformIntegrations } from "../hooks/use-integrations";
import type { IntegrationListItem } from "../types";
import { RecordsList, StatusBadge } from "./configured-integrations";
import { integrationView } from "./connector-status";
import { IntegrationFormDialog } from "./create-integration-dialog";
import { PlatformAvatar } from "./platform-avatar";

/** One line of the index. Rendered only while the index is open, so a closed one computes nothing. */
const PickRow = ({
  integration,
  onPick,
}: {
  integration: IntegrationListItem;
  onPick: (integration: IntegrationListItem) => void;
}) => {
  // The badge sits inside a button, so it gets no tooltip of its own.
  const { state, records } = integrationView(integration);
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(integration)}
        className="flex w-full items-center gap-3 px-6 py-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      >
        <PlatformAvatar name={integration.name} className="size-8" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {integration.name}
        </span>
        <RecordsList
          records={records}
          className="shrink-0 text-right text-xs text-muted-foreground"
        />
        <StatusBadge state={state} errorMessage={null} warningMessage={null} />
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
};

/** The index shown when a platform has several integrations: pick one to edit. */
const PickIntegrationDialog = ({
  entry,
  integrations,
  open,
  onOpenChange,
  onPick,
}: {
  entry: CatalogEntry;
  integrations: IntegrationListItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (integration: IntegrationListItem) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="p-0 gap-0 rounded-2xl overflow-hidden">
      <DialogHeader className="px-6 py-4 border-b gap-1">
        <DialogTitle className="text-xl">Edit {entry.displayName}</DialogTitle>
        <DialogDescription>
          {integrations.length} {plural("integration", integrations.length)}.
          Choose one to edit.
        </DialogDescription>
      </DialogHeader>
      <ul className="max-h-[60vh] overflow-y-auto divide-y">
        {integrations.map((integration) => (
          <PickRow
            key={integration.id}
            integration={integration}
            onPick={onPick}
          />
        ))}
      </ul>
    </DialogContent>
  </Dialog>
);

/**
 * What a catalog card shows once its platform has integrations: "N added" (unless `showCount`
 * is off, as for a singleton, whose button already says "Added"), and an "Edit" button pinned to
 * the card's right edge. One integration opens straight into the edit form; several open an index to
 * pick from first. Renders flex items for the card footer, which must be a flex row.
 */
export const AddedIntegrations = ({
  entry,
  showCount = true,
}: {
  entry: CatalogEntry;
  showCount?: boolean;
}) => {
  const integrations = usePlatformIntegrations(entry.platform);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // An id, not the row, so the form always gets the latest poll's data. Kept after the form
  // closes so the form does not empty out during its close animation.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = integrations.find(({ id }) => id === editingId);

  if (integrations.length === 0) return null;
  const only = integrations.length === 1 ? integrations[0] : null;

  const edit = (integration: IntegrationListItem) => {
    setEditingId(integration.id);
    setPickerOpen(false);
    setEditOpen(true);
  };
  const editLabel = only
    ? `Edit ${only.name}`
    : `Edit ${entry.displayName} integrations`;

  return (
    <>
      {showCount && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <CheckIcon className="size-3.5" /> {integrations.length} added
        </span>
      )}
      {/* The accessible name starts with the visible "Edit", then says what it edits. */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={editLabel}
        className="ml-auto"
        onClick={() => (only ? edit(only) : setPickerOpen(true))}
      >
        <PencilIcon /> Edit
      </Button>

      {!only && (
        <PickIntegrationDialog
          entry={entry}
          integrations={integrations}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={edit}
        />
      )}
      {editing && (
        <IntegrationFormDialog
          entry={entry}
          mode="edit"
          integration={editing}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </>
  );
};
