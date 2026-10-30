import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";
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

/**
 * Queries with deferred params, so a page, search or tab change keeps the list
 * mounted (and the table shows "Loading...") instead of suspending the page.
 */
export const useSuspenseVulnerabilitiesByPriority = () => {
  const trpc = useTRPC();
  const [params] = useVulnerabilitiesByPriorityParams();
  const deferredParams = useDeferredValue(params);

  const { data, isFetching } = useSuspenseQuery(
    trpc.vulnerabilities.getManyByPriorityInternal.queryOptions(deferredParams),
  );
  return { data, isFetching: isFetching || params !== deferredParams };
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
