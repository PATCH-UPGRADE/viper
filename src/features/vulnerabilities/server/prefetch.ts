import type { inferInput } from "@trpc/tanstack-react-query";
import { prefetch, trpc } from "@/trpc/server";

type Input = inferInput<typeof trpc.vulnerabilities.getMany>;

/**
 * Prefetch all vulnerabilities
 */
export const prefetchVulnerabilities = (params: Input) => {
  return prefetch(trpc.vulnerabilities.getMany.queryOptions(params));
};

type InputBySeverity = inferInput<
  typeof trpc.vulnerabilities.getManyBySeverityInternal
>;
export const prefetchVulnerabilitiesBySeverity = (params: InputBySeverity) => {
  return prefetch(
    trpc.vulnerabilities.getManyBySeverityInternal.queryOptions(params),
  );
};

/**
 * Prefetch a single vulnerability
 */
export const prefetchVulnerability = (id: string) => {
  return prefetch(trpc.vulnerabilities.getOne.queryOptions({ id }));
};
