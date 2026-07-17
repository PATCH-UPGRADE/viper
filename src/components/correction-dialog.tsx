"use client";

import { ArrowRightIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function CorrectionDialog({
  open,
  title,
  question,
  fromContent,
  toContent,
  reasonRequired = false,
  onCancel,
  onSave,
}: {
  open: boolean;
  title: string;
  question: string;
  fromContent: ReactNode;
  toContent: ReactNode;
  reasonRequired?: boolean;
  onCancel: () => void;
  onSave: (reason?: string | undefined) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const closeDialog = () => {
    setReason("");
    onCancel();
  };

  const confirm = async () => {
    setSaving(true);
    try {
      await onSave(reason.trim() || undefined);
      setReason("");
    } catch (err) {
    } finally {
      setSaving(false);
    }
  };

  const reasonMissing = reasonRequired && reason.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="gap-0 min-h-[20rem] overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-6 py-4">
          <div className="flex items-center gap-2 text-sm">
            {fromContent}
            <ArrowRightIcon className="size-4 text-muted-foreground" />
            {toContent}
          </div>
          <label className="text-sm font-bold" htmlFor="correction-reason">
            {question}{" "}
            <span className="text-muted-foreground font-normal">
              {reasonRequired ? "" : "(optional)"}
            </span>
          </label>
          <Textarea
            id="correct-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Add context for the activity log"
            className="min-h-26"
          />
        </div>

        <DialogFooter className="border-t bg-muted/50 px-6 py-4">
          <Button
            className="rounded-lg"
            variant="outline"
            onClick={closeDialog}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            className="rounded-lg"
            onClick={confirm}
            disabled={saving || reasonMissing}
          >
            Save change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
