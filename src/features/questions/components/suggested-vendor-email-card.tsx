"use client";
import { Copy, Info, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { SuggestedVendorEmail } from "../types";

export const SuggestedEmailCard = ({
  email,
  onApprove,
  onDismiss,
  isSending = false,
}: {
  email: SuggestedVendorEmail;
  onApprove: () => void;
  onDismiss: () => void;
  isSending: boolean;
}) => {
  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${email.subject}\n\n&{email.body}`);
    toast.success("Email text copied");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 pb-2">
        <Mail className="size-4 text-blue-600" />
        <span className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Suggested vendor email
        </span>
        <Badge
          variant="secondary"
          className="border-blue-500/30 bg-blue-500/15 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/25 dark:text-blue-300"
        >
          {email.companyName}
        </Badge>
        <Badge variant="secondary">{email.productName}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="size-3.5 mt-0.5 shrink-0" />
          <span className="font-bold text-foreground whitespace-nowrap">
            Why send this:
          </span>
          {email.reasonWhy}
        </p>
        <div className="rounded border">
          <div className="flex flex-col gap-1 text-sm border-b bg-muted/50 p-3">
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-muted-foreground">To</span>
              <span className="font-mono">{email.toEmail}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-muted-foreground">
                Subject
              </span>
              <span className="font-bold">{email.subject}</span>
            </div>
          </div>
          <p className="whitespace-pre-line text-sm text-muted-foreground px-3 py-4">
            {email.body}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            className="rounded"
            variant="outline"
            onClick={onDismiss}
            disabled={isSending}
          >
            Dismiss
          </Button>
          <Button
            className="rounded"
            variant="outline"
            onClick={handleCopy}
            disabled={isSending}
          >
            <Copy className="size-4" />
            <span className="font-bold">Copy text</span>
          </Button>
          <Button className="rounded" onClick={onApprove} disabled={isSending}>
            <Send className="size-4" />
            {isSending ? "Sending..." : "Approve & Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
