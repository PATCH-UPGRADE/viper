"use client";

import { formatDistanceToNow } from "date-fns";
import { ChevronDownIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { type PlatformEnum, SyncStatusEnum } from "@/generated/prisma";
import { initialsOf } from "@/lib/string-utils";
import { plural } from "@/lib/utils";
import type { CatalogEntry } from "../core/catalog";
import type { IntegrationListItem } from "../types";
import {
  IntegrationActionsMenu,
  StatusLine,
  type StatusTone,
} from "./integration-row";

export interface UploadStatus {
  text: string;
  tone: StatusTone;
  errorMessage: string | null;
}

export interface PlatformUploads {
  catalogEntry: CatalogEntry;
  uploads: IntegrationListItem[];
}

export type EnabledRow =
  | {
      kind: "integration";
      integration: IntegrationListItem;
      catalogEntry?: CatalogEntry;
    }
  | ({ kind: "uploads" } & PlatformUploads);

interface UploadWording {
  uploaded: string;
  finishedWithErrors: string;
}

const ONE_UPLOAD_WORDING: UploadWording = {
  uploaded: "Uploaded",
  finishedWithErrors: "Finished with errors",
};

const LATEST_UPLOAD_WORDING: UploadWording = {
  uploaded: "Last uploaded",
  finishedWithErrors: "Last upload finished with errors",
};

const relativeTime = (date: Date) =>
  formatDistanceToNow(date, { addSuffix: true });

const startedAtOf = (upload: IntegrationListItem): Date | null =>
  upload.resourceSyncs[0]?.lastAttemptAt ?? null;

const newestFirst = (uploads: IntegrationListItem[]): IntegrationListItem[] =>
  [...uploads].sort((first, second) => {
    const firstStartedAt = startedAtOf(first)?.getTime() ?? 0;
    const secondStartedAt = startedAtOf(second)?.getTime() ?? 0;
    return secondStartedAt - firstStartedAt;
  });

export const enabledRowsFor = (
  integrations: IntegrationListItem[],
  catalog: CatalogEntry[],
): EnabledRow[] => {
  const entryByPlatform = new Map(
    catalog.map((entry) => [entry.platform, entry]),
  );
  const uploadsByPlatform = new Map<PlatformEnum, IntegrationListItem[]>();
  const rows: EnabledRow[] = [];

  for (const integration of integrations) {
    const catalogEntry = entryByPlatform.get(integration.platform);
    if (!catalogEntry?.unscheduled) {
      rows.push({ kind: "integration", integration, catalogEntry });
      continue;
    }
    const hasStartedUploading = startedAtOf(integration) !== null;
    if (!hasStartedUploading) continue;

    const uploadsSoFar = uploadsByPlatform.get(integration.platform);
    if (uploadsSoFar) {
      uploadsSoFar.push(integration);
      continue;
    }
    const uploads = [integration];
    uploadsByPlatform.set(integration.platform, uploads);
    rows.push({ kind: "uploads", catalogEntry, uploads });
  }

  return rows.map((row) =>
    row.kind === "uploads"
      ? { ...row, uploads: newestFirst(row.uploads) }
      : row,
  );
};

export const uploadStatusOf = (
  upload: IntegrationListItem,
  wording: UploadWording = ONE_UPLOAD_WORDING,
): UploadStatus => {
  const sync = upload.resourceSyncs[0];
  const startedAt = startedAtOf(upload);
  if (!sync || !startedAt) {
    return { text: "Not uploaded yet", tone: "idle", errorMessage: null };
  }
  if (sync.status === SyncStatusEnum.Pending) {
    return { text: "Importing…", tone: "idle", errorMessage: null };
  }
  if (sync.status === SyncStatusEnum.Error) {
    return {
      text: `${wording.finishedWithErrors} ${relativeTime(startedAt)}`,
      tone: "error",
      errorMessage: sync.errorMessage,
    };
  }
  return {
    text: `${wording.uploaded} ${relativeTime(startedAt)}`,
    tone: "ok",
    errorMessage: null,
  };
};

export const latestUploadStatusOf = (
  uploadsNewestFirst: IntegrationListItem[],
): UploadStatus => uploadStatusOf(uploadsNewestFirst[0], LATEST_UPLOAD_WORDING);

const UploadRow = ({
  upload,
  catalogEntry,
}: {
  upload: IntegrationListItem;
  catalogEntry: CatalogEntry;
}) => (
  <li className="flex items-center gap-3 px-4 py-2.5">
    <span className="min-w-0 flex-1 truncate text-sm font-medium">
      {upload.name}
    </span>
    <StatusLine {...uploadStatusOf(upload)} />
    <IntegrationActionsMenu integration={upload} catalogEntry={catalogEntry} />
  </li>
);

export const PlatformUploadsCard = ({
  catalogEntry,
  uploads,
}: PlatformUploads) => {
  const uploadCount = uploads.length;
  return (
    <Collapsible>
      <div className="flex items-center gap-3 p-4">
        <Avatar className="size-9 shrink-0 rounded-md border">
          <AvatarFallback className="rounded-md bg-accent text-accent-foreground text-xs font-semibold">
            {initialsOf(catalogEntry.displayName)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 font-semibold">
          {catalogEntry.displayName}
          <span className="font-normal text-muted-foreground">
            {" "}
            · {uploadCount} {plural("upload", uploadCount)}
          </span>
        </div>

        <StatusLine {...latestUploadStatusOf(uploads)} />

        <CollapsibleTrigger
          aria-label={`${catalogEntry.displayName} uploads`}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent [&[data-state=open]>svg]:rotate-180"
        >
          <ChevronDownIcon className="size-4 transition-transform" />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ul className="mx-4 mb-3 rounded-lg border divide-y">
          {uploads.map((upload) => (
            <UploadRow
              key={upload.id}
              upload={upload}
              catalogEntry={catalogEntry}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};
