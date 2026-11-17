"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { type Dispatch, type SetStateAction, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { useCreateTicket } from "../hooks/use-tracking";
import {
  AssetPickerPopover,
  type AttachableAsset,
  describeAttachableAsset,
} from "./ticket-detail/asset-picker-popover";
import {
  emptyTicketFormState,
  endTimeError,
  TicketFormFields,
  ticketFormFingerprint,
  ticketFormInput,
} from "./ticket-detail/edit-form";

const DISCARD_PROMPT = "Discard this work order?";
const EMPTY_FORM_FINGERPRINT = ticketFormFingerprint(emptyTicketFormState());

const LinkedAssetsField = ({
  assets,
  setAssets,
}: {
  assets: AttachableAsset[];
  setAssets: Dispatch<SetStateAction<AttachableAsset[]>>;
}) => (
  <div className="rounded-lg border bg-background p-4 flex flex-col gap-4">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium">
        Linked assets{" "}
        <span className="text-muted-foreground">({assets.length})</span>
      </h2>
      <AssetPickerPopover
        excludeIds={assets.map((a) => a.id)}
        onSelect={(asset, close) => {
          setAssets((prev) => [...prev, asset]);
          close();
        }}
      />
    </div>
    {assets.length > 0 ? (
      <ul className="flex flex-col divide-y rounded-md border">
        {assets.map((asset) => {
          const { label, sub } = describeAttachableAsset(asset);
          return (
            <li
              key={asset.id}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-xs font-medium">
                  {label}
                </span>
                {sub && (
                  <span className="truncate text-xs text-muted-foreground">
                    {sub}
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setAssets((prev) => prev.filter((a) => a.id !== asset.id))
                }
                aria-label={`Remove ${label}`}
              >
                <XIcon className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>
    ) : (
      <p className="text-sm text-muted-foreground">
        No assets linked. Each linked asset gets its own sub-ticket.
      </p>
    )}
  </div>
);

/** The dashboard's "New work order" button and the dialog it opens. */
export const CreateWorkOrderButton = () => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyTicketFormState);
  const [assets, setAssets] = useState<AttachableAsset[]>([]);
  const create = useCreateTicket();
  const endError = endTimeError(form);

  const isDirty =
    assets.length > 0 || ticketFormFingerprint(form) !== EMPTY_FORM_FINGERPRINT;
  useBeforeUnload(isDirty);

  const close = () => {
    setOpen(false);
    setForm(emptyTicketFormState());
    setAssets([]);
  };

  // Cancel, Escape, the overlay and the close button all pass through here.
  // A close during the request would reset the form under a draft the user
  // starts next, and the success handler would then clear that draft too.
  const requestClose = () => {
    if (create.isPending) return;
    if (isDirty && !window.confirm(DISCARD_PROMPT)) return;
    close();
  };

  const handleSubmit = () => {
    const values = ticketFormInput(form);
    if (!values.summary || endError) return;
    create.mutate(
      { ...values, assetIds: assets.map((a) => a.id) },
      { onSuccess: close },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : requestClose())}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="size-4" />
          New work order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[95vw] max-w-3xl overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New work order</DialogTitle>
          <DialogDescription>
            VIPER tracks this work order. Link the assets it covers to give each
            one a sub-ticket.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          {/* The request carries the values from submit time, so an edit
              made while it runs would be lost on success. */}
          <fieldset
            disabled={create.isPending}
            className="flex min-w-0 flex-col gap-4"
          >
            <TicketFormFields form={form} setForm={setForm} />
            <LinkedAssetsField assets={assets} setAssets={setAssets} />
          </fieldset>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !!endError}>
              {create.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
