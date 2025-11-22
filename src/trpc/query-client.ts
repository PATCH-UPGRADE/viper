import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';
import { QUERY_SERIALIZATION_CONFIG } from '@/lib/trpc-config';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
      dehydrate: {
        ...QUERY_SERIALIZATION_CONFIG,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
      hydrate: {
        ...QUERY_SERIALIZATION_CONFIG,
      },
    },
  });
}