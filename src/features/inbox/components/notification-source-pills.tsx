"use client";

import { ExternalLinkIcon, MailIcon, PaperclipIcon } from "lucide-react";
import { useState } from "react";
import type {
  NotificationDetailSource,
  NotificationDetailWithRelations,
} from "../types";
import { EmailSourceModal } from "./email-source-modal";
import { attachmentDownloadPath, emailSenderName, nvdUrl } from "./shared";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium hover:bg-accent";

export function NotificationSourcePills({
  notification,
}: {
  notification: NotificationDetailWithRelations;
}) {
  const [openedSource, setOpenedSource] =
    useState<NotificationDetailSource | null>(null);

  const sourceRecords = notification.sourceLinks.map(
    (link) => link.sourceRecord,
  );
  const emailSources = sourceRecords.filter(
    (source) => source.channel === "Email",
  );
  const attachments = sourceRecords.flatMap((source) => source.attachments);
  const cveIds = [
    ...new Set(
      notification.vulnerabilities
        .map((mapping) => mapping.vulnerability.cveId)
        .filter((cveId): cveId is string => cveId !== null),
    ),
  ];

  if (emailSources.length + attachments.length + cveIds.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Sources
      </span>
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          href={attachmentDownloadPath(attachment.id)}
          className={PILL}
        >
          {attachment.filename ?? "Attachment"}
          <PaperclipIcon className="size-3 text-muted-foreground" />
        </a>
      ))}
      {cveIds.map((cveId) => (
        <a
          key={cveId}
          href={nvdUrl(cveId)}
          target="_blank"
          rel="noopener noreferrer"
          className={PILL}
        >
          {cveId} · NVD
          <ExternalLinkIcon className="size-3 text-muted-foreground" />
        </a>
      ))}
      {emailSources.map((source) => (
        <button
          key={source.id}
          type="button"
          onClick={() => setOpenedSource(source)}
          className={PILL}
        >
          {emailSenderName(source.raw) ?? "Email"}
          <MailIcon className="size-3 text-muted-foreground" />
        </button>
      ))}
      {openedSource !== null && (
        <EmailSourceModal
          source={openedSource}
          open
          onOpenChange={(open) => {
            if (!open) setOpenedSource(null);
          }}
        />
      )}
    </div>
  );
}
