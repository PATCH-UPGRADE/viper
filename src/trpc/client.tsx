'use client';
// ^-- to make sure we can mount the Provider from a server component
import { QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { createBrowserSingleton } from '@/lib/singleton';
import { getApiUrl } from '@/lib/url-utils';
import { TRPC_TRANSFORMER } from '@/lib/trpc-config';
import { makeQueryClient } from './query-client';
import type { AppRouter } from './routers/_app';
import type { ChildrenProps } from '@/lib/page-types';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

const getQueryClient = createBrowserSingleton(makeQueryClient);

export function TRPCReactProvider(props: Readonly<ChildrenProps>) {
  // NOTE: Avoid useState when initializing the query client if you don't
  //       have a suspense boundary between this and the code that may
  //       suspend because React will throw away the client on the initial
  //       render if it suspends and there is no boundary
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          transformer: TRPC_TRANSFORMER,
          url: getApiUrl('/api/trpc'),
        }),
      ],
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
