import superjson from "superjson";

/**
 * Shared SuperJSON transformer for tRPC
 * Use this consistently across client and server tRPC configuration
 */
export const TRPC_TRANSFORMER = superjson;

/**
 * Query client serialization configuration using SuperJSON
 * Use this in QueryClient dehydrate/hydrate configuration
 */
export const QUERY_SERIALIZATION_CONFIG = {
  serializeData: superjson.serialize,
  deserializeData: superjson.deserialize,
} as const;
