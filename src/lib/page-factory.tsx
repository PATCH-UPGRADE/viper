import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { SearchParamsPageProps } from "./page-types";

/**
 * Configuration for creating a standard paginated list page
 */
export type ListPageConfig<TParams> = {
  /** Function to load and parse URL parameters */
  paramsLoader: (searchParams: Promise<SearchParams>) => Promise<TParams>;
  /** Function to prefetch data on the server */
  prefetch: (params: TParams) => Promise<void> | void;
  /** Container component that wraps the page */
  Container: React.ComponentType<{ children: React.ReactNode }>;
  /** List component that displays the data */
  List: React.ComponentType;
  /** Loading fallback component */
  Loading: React.ComponentType;
  /** Error fallback component */
  Error: React.ComponentType;
};

/**
 * Factory function that creates a standard paginated list page
 * following the pattern: auth → params → prefetch → hydrate → error boundary → suspense
 *
 * @example
 * ```typescript
 * export default createListPage({
 *   paramsLoader: workflowsParamsLoader,
 *   prefetch: prefetchWorkflows,
 *   Container: WorkflowsContainer,
 *   List: WorkflowsList,
 *   Loading: WorkflowsLoading,
 *   Error: WorkflowsError,
 * });
 * ```
 */
export function createListPage<TParams>(
  config: ListPageConfig<TParams>,
): React.FC<SearchParamsPageProps> {
  const Page = async ({ searchParams }: SearchParamsPageProps) => {
    await requireAuth();

    const params = await config.paramsLoader(searchParams);
    await config.prefetch(params);

    return (
      <config.Container>
        <HydrateClient>
          <ErrorBoundary fallback={<config.Error />}>
            <Suspense fallback={<config.Loading />}>
              <config.List />
            </Suspense>
          </ErrorBoundary>
        </HydrateClient>
      </config.Container>
    );
  };

  return Page;
}
