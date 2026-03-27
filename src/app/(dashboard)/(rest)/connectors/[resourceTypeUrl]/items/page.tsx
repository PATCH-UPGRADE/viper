import { notFound } from "next/navigation";
import type React from "react";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  ConnectorsError,
  ConnectorsLoading,
} from "@/features/api-key-connectors/components/connectors";
import { AssetsList } from "@/features/assets/components/assets";
import { prefetchAssets } from "@/features/assets/server/prefetch";
import { DeviceArtifactsDataList } from "@/features/device-artifacts/components/device-artifacts";
import { prefetchDeviceArtifacts } from "@/features/device-artifacts/server/prefetch";
import { paginationParamsLoader } from "@/features/integrations/server/params-loader";
import {
  integrationsMapping,
  isValidResourceTypeKey,
} from "@/features/integrations/types";
import { RemediationsDataList } from "@/features/remediations/components/remediations";
import { prefetchRemediations } from "@/features/remediations/server/prefetch";
import { VulnerabilitiesList } from "@/features/vulnerabilities/components/vulnerabilities";
import { prefetchVulnerabilities } from "@/features/vulnerabilities/server/prefetch";
import { ResourceType } from "@/generated/prisma";
import { requireAuth } from "@/lib/auth-utils";
import type { CombinedPageProps } from "@/lib/page-types";
import type { PaginationInput } from "@/lib/pagination";
import { HydrateClient } from "@/trpc/server";

interface ConnectorResourceTypeConfig {
  listElement: React.FC;
  prefetch: (params: PaginationInput) => void;
}

const LIST_MAPPING: Record<string, ConnectorResourceTypeConfig> = {
  [ResourceType.Asset]: {
    listElement: AssetsList,
    prefetch: prefetchAssets,
  },
  [ResourceType.DeviceArtifact]: {
    listElement: DeviceArtifactsDataList,
    prefetch: prefetchDeviceArtifacts,
  },
  [ResourceType.Remediation]: {
    listElement: RemediationsDataList,
    prefetch: prefetchRemediations,
  },
  [ResourceType.Vulnerability]: {
    listElement: VulnerabilitiesList,
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
  const ListElement = config.listElement;
  const paginationParams = await paginationParamsLoader(searchParams);
  await config.prefetch({ ...paginationParams });

  return (
    <HydrateClient>
      <ErrorBoundary fallback={<ConnectorsError />}>
        <Suspense fallback={<ConnectorsLoading />}>
          <ListElement />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
};

export default Page;
