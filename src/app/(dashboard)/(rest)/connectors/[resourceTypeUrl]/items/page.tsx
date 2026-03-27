import { notFound } from "next/navigation";
import type React from "react";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  AssetsError,
  AssetsList,
  AssetsLoading,
} from "@/features/assets/components/assets";
import { prefetchAssets } from "@/features/assets/server/prefetch";
import {
  DeviceArtifactsDataList,
  DeviceArtifactsError,
} from "@/features/device-artifacts/components/device-artifacts";
import { prefetchDeviceArtifacts } from "@/features/device-artifacts/server/prefetch";
import { paginationParamsLoader } from "@/features/integrations/server/params-loader";
import {
  integrationsMapping,
  isValidResourceTypeKey,
} from "@/features/integrations/types";
import {
  RemediationsDataList,
  RemediationsError,
  RemediationsLoading,
} from "@/features/remediations/components/remediations";
import { prefetchRemediations } from "@/features/remediations/server/prefetch";
import {
  VulnerabilitiesError,
  VulnerabilitiesList,
  VulnerabilitiesLoading,
} from "@/features/vulnerabilities/components/vulnerabilities";
import { prefetchVulnerabilities } from "@/features/vulnerabilities/server/prefetch";
import { ResourceType } from "@/generated/prisma";
import { requireAuth } from "@/lib/auth-utils";
import type { CombinedPageProps } from "@/lib/page-types";
import type { PaginationInput } from "@/lib/pagination";
import { HydrateClient } from "@/trpc/server";

interface ConnectorResourceTypeConfig {
  errorElement: () => React.ReactNode;
  listElement: React.FC;
  loadingElement: () => React.ReactNode;
  prefetch: (params: PaginationInput) => void;
}

const LIST_MAPPING: Record<string, ConnectorResourceTypeConfig> = {
  [ResourceType.Asset]: {
    errorElement: AssetsError,
    listElement: AssetsList,
    loadingElement: AssetsLoading,
    prefetch: prefetchAssets,
  },
  [ResourceType.DeviceArtifact]: {
    errorElement: DeviceArtifactsError,
    listElement: DeviceArtifactsDataList,
    loadingElement: VulnerabilitiesLoading,
    prefetch: prefetchDeviceArtifacts,
  },
  [ResourceType.Remediation]: {
    errorElement: RemediationsError,
    listElement: RemediationsDataList,
    loadingElement: RemediationsLoading,
    prefetch: prefetchRemediations,
  },
  [ResourceType.Vulnerability]: {
    errorElement: VulnerabilitiesError,
    listElement: VulnerabilitiesList,
    loadingElement: VulnerabilitiesLoading,
    prefetch: prefetchVulnerabilities,
  },
};

const Page = async ({
  params,
  searchParams,
}: CombinedPageProps<"resourceTypeUrl">) => {
  await requireAuth();
  const { resourceTypeUrl } = await params;

  if (!isValidResourceTypeKey(resourceTypeUrl)) {
    return notFound();
  }

  const resourceType = integrationsMapping[resourceTypeUrl].type;
  const config = LIST_MAPPING[resourceType];
  const paginationParams = await paginationParamsLoader(searchParams);
  await config.prefetch({ ...paginationParams });

  return (
    <HydrateClient>
      <ErrorBoundary fallback={<config.errorElement />}>
        <Suspense fallback={<config.loadingElement />}>
          <config.listElement />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
