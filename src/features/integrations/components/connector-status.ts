import { type ResourceType, SyncStatusEnum } from "@/generated/prisma";
import { plural } from "@/lib/utils";
import type {
  IntegrationListItem,
  IntegrationResourceSyncItem,
} from "../types";
import { resourceTypeLabel } from "../types";

/** What a row of the configured-integrations table says about one integration, stream or upload. */
export type ConnectorState =
  | "healthy"
  | "failing"
  | "paused"
  | "unknown"
  | "importing";

export interface RecordCount {
  resource: ResourceType;
  count: number;
}

export interface SyncSchedule {
  /** Seconds between syncs. More than one when an integration's streams differ. */
  every: number[];
  /** Null while paused, so a paused row never promises a next sync. */
  nextSyncAt: Date | null;
  isDue: boolean;
}

export interface ConnectorView {
  state: ConnectorState;
  /** Only set while failing, and only when there is something to say. */
  errorMessage: string | null;
  /** Last successful sync, or for an upload, when it started. */
  lastAt: Date | null;
  /** Null for an upload, which has no schedule. */
  schedule: SyncSchedule | null;
  records: RecordCount[];
}

const recordCountFor = (
  integration: IntegrationListItem,
  resource: ResourceType,
): RecordCount => ({
  resource,
  count: integration.recordCounts[resource],
});

/**
 * Every record an integration has brought in: its own records first (zero included, in the
 * order given), then any other type it has records of. An integration can hold records of a
 * type it has no stream for, for example after a stream was removed.
 */
const recordsOf = (
  integration: IntegrationListItem,
  ownResources: ResourceType[],
): RecordCount[] => {
  const own = ownResources.map((resource) =>
    recordCountFor(integration, resource),
  );
  const others = (Object.keys(integration.recordCounts) as ResourceType[])
    .filter((resource) => !ownResources.includes(resource))
    .map((resource) => recordCountFor(integration, resource))
    .filter(({ count }) => count > 0);
  return [...own, ...others];
};

/**
 * Whether an integration is paused as a whole: switched off, or with every stream switched off.
 * The status badge and the Pause/Resume menu item both read this, so they cannot disagree.
 */
export const isPaused = (integration: IntegrationListItem): boolean =>
  !integration.enabled ||
  (integration.resourceSyncs.length > 0 &&
    integration.resourceSyncs.every((sync) => !sync.enabled));

/** "1,204 work orders", "1 asset", "0 notifications". */
export const recordLabel = ({ resource, count }: RecordCount) =>
  `${count.toLocaleString("en-US")} ${plural(resourceTypeLabel(resource).toLowerCase(), count)}`;

/** "Assets", "Work Orders": the name a stream row goes by. */
export const streamName = (resource: ResourceType) =>
  plural(resourceTypeLabel(resource), 2);

const latest = (dates: (Date | null)[]) => pickDate(dates, Math.max);
const soonest = (dates: (Date | null)[]) => pickDate(dates, Math.min);

const pickDate = (
  dates: (Date | null)[],
  choose: (...values: number[]) => number,
): Date | null => {
  const times = dates
    .filter((date): date is Date => date != null)
    .map((date) => new Date(date).getTime());
  return times.length ? new Date(choose(...times)) : null;
};

const syncState = (
  sync: IntegrationResourceSyncItem,
  integrationEnabled: boolean,
): ConnectorState => {
  if (!integrationEnabled || !sync.enabled) return "paused";
  if (sync.status === SyncStatusEnum.Error) return "failing";
  if (sync.status === SyncStatusEnum.Success) return "healthy";
  return "unknown";
};

/** One stream (resource sync) of a scheduled integration. */
export const streamView = (
  integration: IntegrationListItem,
  sync: IntegrationResourceSyncItem,
): ConnectorView => {
  const state = syncState(sync, integration.enabled);
  const paused = state === "paused";
  return {
    state,
    errorMessage: state === "failing" ? sync.errorMessage : null,
    lastAt: sync.lastSuccessfulSync,
    schedule: {
      every: [sync.effectiveSyncEvery],
      nextSyncAt: paused ? null : sync.nextSyncAt,
      isDue: !paused && sync.isDue,
    },
    records: [recordCountFor(integration, sync.resource)],
  };
};

/**
 * A scheduled integration as a whole. With one stream it is that stream; with several, it is
 * failing if any running stream fails, healthy if any running stream has synced, and paused
 * only when every stream is.
 */
export const integrationView = (
  integration: IntegrationListItem,
): ConnectorView => {
  const syncs = integration.resourceSyncs;
  const records = recordsOf(
    integration,
    syncs.map((sync) => sync.resource),
  );
  if (syncs.length === 1) {
    return { ...streamView(integration, syncs[0]), records };
  }

  const streams = syncs.map((sync) => streamView(integration, sync));
  const running = streams.filter((stream) => stream.state !== "paused");
  const failing = running.filter((stream) => stream.state === "failing");
  const state: ConnectorState = isPaused(integration)
    ? "paused"
    : failing.length > 0
      ? "failing"
      : running.some((stream) => stream.state === "healthy")
        ? "healthy"
        : "unknown";

  const firstError = failing.find(
    (stream) => stream.errorMessage,
  )?.errorMessage;
  const timingSource = running.length > 0 ? running : streams;

  return {
    state,
    errorMessage:
      state === "failing" && firstError
        ? `${failing.length} of ${streams.length} streams failing. ${firstError}`
        : null,
    lastAt: latest(timingSource.map((stream) => stream.lastAt)),
    schedule: {
      every: [...new Set(syncs.map((sync) => sync.effectiveSyncEvery))].sort(
        (a, b) => a - b,
      ),
      nextSyncAt:
        state === "paused"
          ? null
          : soonest(
              running.map((stream) => stream.schedule?.nextSyncAt ?? null),
            ),
      isDue:
        state !== "paused" &&
        running.some((stream) => stream.schedule?.isDue ?? false),
    },
    records,
  };
};

/** One upload of an unscheduled platform (CSV upload). */
export const uploadView = (upload: IntegrationListItem): ConnectorView => {
  const sync = upload.resourceSyncs[0];
  if (!sync) {
    return {
      state: "unknown",
      errorMessage: null,
      lastAt: null,
      schedule: null,
      records: recordsOf(upload, []),
    };
  }
  const state: ConnectorState =
    sync.status === SyncStatusEnum.Error
      ? "failing"
      : sync.status === SyncStatusEnum.Success
        ? "healthy"
        : "importing";
  return {
    state,
    errorMessage: state === "failing" ? sync.errorMessage : null,
    lastAt: sync.lastAttemptAt,
    schedule: null,
    records: recordsOf(upload, [sync.resource]),
  };
};

/** A platform's uploads as one row: the newest upload's status, and every upload's records added up. */
export const uploadGroupView = (
  uploadsNewestFirst: IntegrationListItem[],
): ConnectorView => {
  const totals = new Map<ResourceType, number>();
  for (const upload of uploadsNewestFirst) {
    for (const { resource, count } of uploadView(upload).records) {
      totals.set(resource, (totals.get(resource) ?? 0) + count);
    }
  }
  return {
    ...uploadView(uploadsNewestFirst[0]),
    records: [...totals].map(([resource, count]) => ({ resource, count })),
  };
};
