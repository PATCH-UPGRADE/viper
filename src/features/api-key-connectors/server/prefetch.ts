import type { inferInput } from "@trpc/tanstack-react-query";
import { ResourceType } from "@/generated/prisma";
import { prefetch, trpc } from "@/trpc/server";

// endpoint takes in a resourceType but we don't pass that value via params
type Input = Omit<
  inferInput<typeof trpc.apiKeyConnectors.getManyByTypeInternal>,
  "resourceType"
>;

const prefetchConnectorsByType = (
  params: Input,
  resourceType: ResourceType,
) => {
  return prefetch(
    trpc.apiKeyConnectors.getManyByTypeInternal.queryOptions({
      ...params,
      resourceType,
    }),
  );
};

export const prefetchAssetConnectors = (params: Input) => {
  return prefetchConnectorsByType(params, ResourceType.Asset);
};

export const prefetchDeviceArtifactConnectors = (params: Input) => {
  return prefetchConnectorsByType(params, ResourceType.DeviceArtifact);
};

export const prefetchRemediationConnectors = (params: Input) => {
  return prefetchConnectorsByType(params, ResourceType.Remediation);
};

export const prefetchVulnerabilityConnectors = (params: Input) => {
  return prefetchConnectorsByType(params, ResourceType.Vulnerability);
};
