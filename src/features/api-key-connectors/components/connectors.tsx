"use client";

import {
  EmptyView,
  EntityContainer,
  EntityHeader,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { DataTable } from "@/components/ui/data-table";
import { ResourceType } from "@/generated/prisma";
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
  return (
    <EmptyView message="No connectors found. Connectors are typically seeded using the database seed script." />
  );
};

export const ConnectorsHeader = ({
  disabled,
  resourceType,
}: {
  disabled?: boolean;
  resourceType: string;
}) => {
  return (
    <EntityHeader
      title={`${resourceType} Connectors`}
      description={`View connectors that others are using`}
      disabled={disabled}
    />
  );
};

const ConnectorsContainer = ({
  children,
  resourceType,
}: {
  children: React.ReactNode;
  resourceType: ResourceType | string;
}) => {
  return (
    <EntityContainer header={<ConnectorsHeader resourceType={resourceType} />}>
      {children}
    </EntityContainer>
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

export const AssetConnectorsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <ConnectorsContainer resourceType={ResourceType.Asset}>
      {children}
    </ConnectorsContainer>
  );
};

export const DeviceArtifactConnectorsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <ConnectorsContainer resourceType={"Device Artifact"}>
      {children}
    </ConnectorsContainer>
  );
};

export const RemediationConnectorsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <ConnectorsContainer resourceType={ResourceType.Remediation}>
      {children}
    </ConnectorsContainer>
  );
};

export const VulnerabilityConnectorsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <ConnectorsContainer resourceType={ResourceType.Vulnerability}>
      {children}
    </ConnectorsContainer>
  );
};

export const AssetConnectorList = () => {
  return <ConnectorsList resourceType={ResourceType.Asset} />;
};

export const DeviceArtifactConnectorList = () => {
  return <ConnectorsList resourceType={ResourceType.DeviceArtifact} />;
};

export const RemediationConnectorList = () => {
  return <ConnectorsList resourceType={ResourceType.Remediation} />;
};

export const VulnerabilityConnectorList = () => {
  return <ConnectorsList resourceType={ResourceType.Vulnerability} />;
};
