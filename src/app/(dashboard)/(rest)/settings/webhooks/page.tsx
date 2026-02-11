import { paginationParamsLoader } from "@/features/integrations/server/params-loader";
import {
  WebhooksContainer,
  WebhooksError,
  WebhooksList,
  WebhooksLoading,
} from "@/features/webhooks/components/webhooks";
import { prefetchWebhooks } from "@/features/webhooks/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  Container: WebhooksContainer,
  paramsLoader: paginationParamsLoader,
  prefetch: prefetchWebhooks,
  List: WebhooksList,
  Loading: WebhooksLoading,
  Error: WebhooksError,
});
