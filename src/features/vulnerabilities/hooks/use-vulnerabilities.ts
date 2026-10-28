import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import {
  useVulnerabilitiesByPriorityParams,
  useVulnerabilitiesParams,
} from "./use-vulnerabilities-params";

/**
 * Hook to fetch all vulnerabilities using suspense
 */
export const useSuspenseVulnerabilities = () => {
  const trpc = useTRPC();
  const [params] = useVulnerabilitiesParams();

  return useSuspenseQuery(trpc.vulnerabilities.getMany.queryOptions(params));
};

export const useSuspenseVulnerabilitiesByPriority = () => {
  const trpc = useTRPC();
  const [params] = useVulnerabilitiesByPriorityParams();

  return useSuspenseQuery(
    trpc.vulnerabilities.getManyByPriorityInternal.queryOptions(params),
  );
};

export const useSuspenseVulnerabilityPriorityMetrics = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(
    trpc.vulnerabilities.getPriorityMetricsInternal.queryOptions(),
  );
};

/**
 * Hook to fetch a single vulnerability using suspense
 */
export const useSuspenseVulnerability = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.vulnerabilities.getOne.queryOptions({ id }));
};
