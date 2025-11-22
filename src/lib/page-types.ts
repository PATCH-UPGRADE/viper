import type { SearchParams } from "nuqs/server";

/**
 * Standard props for pages with dynamic route parameters
 * @example
 * // For /assets/[assetId]/page.tsx
 * type Props = DynamicPageProps<"assetId">;
 */
export type DynamicPageProps<T extends string> = {
  params: Promise<Record<T, string>>;
};

/**
 * Standard props for pages with search parameters (list pages)
 */
export type SearchParamsPageProps = {
  searchParams: Promise<SearchParams>;
};

/**
 * Combined props for pages with both dynamic params and search params
 */
export type CombinedPageProps<T extends string> = DynamicPageProps<T> &
  SearchParamsPageProps;

/**
 * Standard children prop type for layouts and container components
 */
export type ChildrenProps = {
  children: React.ReactNode;
};

/**
 * Readonly version of children props
 */
export type ReadonlyChildrenProps = Readonly<ChildrenProps>;
