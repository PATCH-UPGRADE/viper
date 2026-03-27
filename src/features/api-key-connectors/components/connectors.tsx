"use client";

import {
  EmptyView,
  EntityHeader,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { DataTable } from "@/components/ui/data-table";
import type { ResourceType } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import {
  useConnectorParams,
  useSuspenseConnectorsByResourceType,
} from "../hooks/use-connectors";
import { columns } from "./columns";

export const ConnectorsLoading = () => {
  return <LoadingView message="Loading connectors..." />;
};

export const ConnectorsError = () => {
  return <ErrorView message="Error loading connectors" />;
};

export const ConnectorsEmpty = () => {
  return <EmptyView message="No connectors found." />;
};

export const ConnectorsHeader = ({
  disabled,
  title,
}: {
  disabled?: boolean;
  title: string;
}) => {
  return (
    <EntityHeader
      title={`${title} Connectors`}
      description={`View connectors that others are using`}
      disabled={disabled}
    />
  );
};

const ConnectorsSearch = () => {
  const [params, setParams] = useConnectorParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search connectors"
    />
  );
};

export const ConnectorsList = ({
  resourceType,
}: {
  resourceType: ResourceType;
}) => {
  const { data: connectors, isFetching } = useSuspenseConnectorsByResourceType({
    resourceType,
  });

  return (
    <DataTable
      paginatedData={connectors}
      columns={columns}
      isLoading={isFetching}
      search={<ConnectorsSearch />}
    />
  );
};
