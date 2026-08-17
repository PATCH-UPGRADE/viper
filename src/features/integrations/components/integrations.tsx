"use client";

import { CircleCheck, CircleDot, CircleX } from "lucide-react";
import {
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { DataTable } from "@/components/ui/data-table";
import { mainPadding } from "@/config/constants";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import type { SyncStatusEnum } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import { usePaginationParams } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { useSuspenseIntegrations } from "../hooks/use-integrations";
import { columns, resourceColumns } from "./columns";

export const IntegrationsSearch = () => {
  const [params, setParams] = usePaginationParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search integrations by name"
    />
  );
};

export const IntegrationsList = () => {
  const { data: integrations } = useSuspenseIntegrations();

  // Only worth expanding when there's more than one resource to break out.
  const items = integrations.items.map((integration) => ({
    ...integration,
    expandableResourceSyncs:
      integration.resourceSyncs.length > 1 ? integration.resourceSyncs : [],
  }));

  return (
    <DataTable
      search={<IntegrationsSearch />}
      paginatedData={{ ...integrations, items }}
      columns={columns}
      nestedColumns={resourceColumns}
      nestedDataKey="expandableResourceSyncs"
      // No isLoading here on purpose: this list background-polls every
      // INTEGRATIONS_POLL_INTERVAL_MS, and DataTable's isLoading blanks the
      // whole table to "Loading..." — fine for a user-triggered refetch, but
      // it would make the table flash on every silent poll tick. useSuspenseQuery
      // also guarantees data is already present by the time this renders, so
      // there's no genuine "loading" state left to show here anyway.
    />
  );
};

export const SyncStatusIndicator = ({
  status,
}: {
  status?: SyncStatusEnum;
}) => {
  const className = "flex gap-1 items-center font-semibold";
  switch (status) {
    case "Error":
      return (
        <span className={cn(className, "text-destructive")}>
          <CircleX size={15} /> Error
        </span>
      );
    case "Success":
      return (
        <span className={cn(className, "text-emerald-600")}>
          <CircleCheck size={15} /> Success
        </span>
      );
    default:
      return (
        <span className={cn(className, "text-gray-500")}>
          <CircleDot size={15} /> Pending
        </span>
      );
  }
};

export const IntegrationsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <div className={cn(mainPadding, "flex flex-col gap-4")}>
      <SettingsSubheader
        title="Integrations"
        description="Manage external integrations to sync assets and vulnerabilities"
      />
      {children}
    </div>
  );
};

export const IntegrationsLoading = () => {
  return <LoadingView message="Loading integrations..." />;
};

export const IntegrationsError = () => {
  return <ErrorView message="Error loading integrations" />;
};
