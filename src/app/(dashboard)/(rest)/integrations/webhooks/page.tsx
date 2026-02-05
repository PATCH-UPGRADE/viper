import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  WebhooksContainer,
  WebhooksError,
  WebhooksList,
  WebhooksLoading,
} from "@/features/webhooks/components/webhooks";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

const Page = async () => {
  await requireAuth();
  //const params = await usePaginationParams();

  return (
    <WebhooksContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<WebhooksError />}>
          <Suspense fallback={<WebhooksLoading />}>
            <WebhooksList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </WebhooksContainer>
  );
};

export default Page;
