import { describe, expect, it } from "vitest";
import { PlatformEnum, SyncStatusEnum } from "@/generated/prisma";
import type { CatalogEntry } from "../core/catalog";
import type { IntegrationListItem } from "../types";
import {
  enabledRowsFor,
  latestUploadStatusOf,
  uploadStatusOf,
} from "./platform-uploads-row";

const csvEntry = {
  platform: PlatformEnum.CSV_UPLOAD,
  displayName: "CSV Upload",
  categories: ["Hospital Inventory"],
  unscheduled: true,
} as unknown as CatalogEntry;

const fleetEntry = {
  ...csvEntry,
  platform: PlatformEnum.FLEET,
  displayName: "teamplay Fleet",
  unscheduled: false,
} as CatalogEntry;

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60 * 1000);

const csvUpload = (
  name: string,
  sync: {
    status?: SyncStatusEnum;
    lastAttemptAt?: Date | null;
    errorMessage?: string | null;
  },
) =>
  ({
    id: `int-${name}`,
    name,
    platform: PlatformEnum.CSV_UPLOAD,
    resourceSyncs: [
      {
        status: sync.status ?? SyncStatusEnum.Success,
        lastAttemptAt: sync.lastAttemptAt ?? null,
        errorMessage: sync.errorMessage ?? null,
      },
    ],
  }) as unknown as IntegrationListItem;

const fleetIntegration = {
  id: "int-fleet",
  name: "Siemens Healthineers teamplay Fleet",
  platform: PlatformEnum.FLEET,
  resourceSyncs: [],
} as unknown as IntegrationListItem;

describe("enabledRowsFor", () => {
  it("puts every upload of an unscheduled platform in one row, newest first", () => {
    const rows = enabledRowsFor(
      [
        csvUpload("Older upload", { lastAttemptAt: minutesAgo(600) }),
        fleetIntegration,
        csvUpload("Newer upload", { lastAttemptAt: minutesAgo(10) }),
      ],
      [csvEntry, fleetEntry],
    );

    expect(rows.map((row) => row.kind)).toEqual(["uploads", "integration"]);
    const [uploadsRow] = rows;
    const uploadNames =
      uploadsRow.kind === "uploads"
        ? uploadsRow.uploads.map((upload) => upload.name)
        : [];
    expect(uploadNames).toEqual(["Newer upload", "Older upload"]);
  });

  it("leaves out a source that never started an upload, and the row with it", () => {
    const rows = enabledRowsFor(
      [csvUpload("Abandoned", { status: SyncStatusEnum.Pending })],
      [csvEntry],
    );

    expect(rows).toEqual([]);
  });
});

describe("upload status", () => {
  it("says when an upload ran, that it is running, or that it had errors", () => {
    const finished = csvUpload("Finished", { lastAttemptAt: minutesAgo(10) });
    const running = csvUpload("Running", {
      status: SyncStatusEnum.Pending,
      lastAttemptAt: minutesAgo(1),
    });
    const withErrors = csvUpload("With errors", {
      status: SyncStatusEnum.Error,
      lastAttemptAt: minutesAgo(600),
      errorMessage: "2 of 8 rows failed",
    });

    expect(uploadStatusOf(finished).text).toBe("Uploaded 10 minutes ago");
    expect(uploadStatusOf(running).text).toBe("Importing…");
    expect(uploadStatusOf(withErrors)).toEqual({
      text: "Finished with errors about 10 hours ago",
      tone: "error",
      errorMessage: "2 of 8 rows failed",
    });
  });

  it("words the platform row around its latest upload", () => {
    const uploadsNewestFirst = [
      csvUpload("Newer upload", { lastAttemptAt: minutesAgo(10) }),
      csvUpload("Older upload", { lastAttemptAt: minutesAgo(600) }),
    ];

    expect(latestUploadStatusOf(uploadsNewestFirst).text).toBe(
      "Last uploaded 10 minutes ago",
    );
  });
});
