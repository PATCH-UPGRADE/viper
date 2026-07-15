"use client";

import { ArrowRightIcon } from "lucide-react";
import { ReactNode, useState } from "react";
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 text-sm">
          {fromContent}
          <ArrowRightIcon className="size-4 text-muted-foreground" />
          {toContent}
        </div>
        <label className="text-sm font-medium" htmlFor="correction-reason">
          {question} {reasonRequired ? "" : "(optional)"}
        </label>
        <Textarea
          id="correct-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Add context for the activity log"
          rows={3}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={closeDialog} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={saving || reasonMissing}>
            Save change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
