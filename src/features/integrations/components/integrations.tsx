"use client";

import { EntityContainer, EntityHeader, EntityList } from "@/components/entity-components";
import { useSuspenseIntegrations } from "../hooks/use-integrations";
import { AssetCredentials, VulnerabilityCredentials } from "@/generated/prisma";


export const IntegrationsHeader = ({ disabled }: { disabled?: boolean }) => {
  return (
    <EntityHeader
      title="Vulnerabily Integrations"
      description="Manage vulnerability integrations"
      newButtonLabel="New integrations"
      disabled={disabled}
    />
  );
};

export const IntegrationsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer
      header={<IntegrationsHeader />}
    >
      {children}
    </EntityContainer>
  );
};

export const IntegrationsList = () => {
  const integrations = useSuspenseIntegrations();

  return (
    <EntityList
      items={integrations.data.items}
      getKey={(integration) => integration.id}
      renderItem={(integration) => <IntegrationItem data={integration} />}
      emptyView={<p>No integrations yet...</p>}
    />
  );
};

export const IntegrationItem = ({data}: {data: VulnerabilityCredentials | AssetCredentials}) => {
  return (
  <p>Integration: {JSON.stringify({data})}</p>
  )
}
