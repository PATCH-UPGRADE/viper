"use client";

import { format } from "date-fns";
import { MailIcon } from "lucide-react";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatFileSize } from "@/lib/utils";
import type { NotificationDetailSource, RawEmailPayload } from "../types";
import {
  attachmentDownloadPath,
  emailSenderName,
  fileExtensionLabel,
} from "./shared";

export function EmailSourceModal({
  source,
  open,
  onOpenChange,
}: {
  source: NotificationDetailSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const raw = source.raw as unknown as RawEmailPayload;
  const senderName = emailSenderName(source.raw);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl lg:max-w-5xl 2xl:max-w-7xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex flex-wrap items-center gap-2 wrap-anywhere">
            <MailIcon className="size-4 text-muted-foreground" />
            Email from {senderName ?? "unknown sender"}
            <Badge variant="secondary">raw</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 overflow-auto min-h-0">
          <Card>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {(
                  [
                    { label: "From", value: raw.data?.from ?? "—" },
                    { label: "Subject", value: raw.data?.subject ?? "—" },
                    {
                      label: "Date",
                      value: format(source.observedAt, "PPP p"),
                    },
                  ] satisfies { label: string; value: string }[]
                ).map(({ label, value }) => (
                  <Fragment key={label}>
                    <dt className="font-medium text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="wrap-anywhere">{value}</dd>
                  </Fragment>
                ))}
              </dl>
              {source.attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
                  <span className="font-medium text-muted-foreground">
                    Attached
                  </span>
                  {source.attachments.map((attachment) => {
                    const typeLabel = fileExtensionLabel(attachment.filename);
                    return (
                      <a
                        key={attachment.id}
                        href={attachmentDownloadPath(attachment.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border bg-muted/50 px-2.5 py-1.5 hover:bg-accent"
                      >
                        <Badge
                          variant="outline"
                          className={cn(
                            typeLabel === "PDF" &&
                              "text-red-700 dark:text-red-300",
                          )}
                        >
                          {typeLabel}
                        </Badge>
                        <span className="font-medium">
                          {attachment.filename ?? "Attachment"}
                        </span>
                        {attachment.size !== null && (
                          <span className="text-muted-foreground">
                            {formatFileSize(attachment.size)}
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          {source.markdown && (
            <Card className="overflow-auto">
              <CardContent>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                  {source.markdown}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
