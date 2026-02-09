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
import { prefetchWebhooks } from "@/features/webhooks/server/prefetch";

const Page = async () => {
  await requireAuth();
  prefetchWebhooks();

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
