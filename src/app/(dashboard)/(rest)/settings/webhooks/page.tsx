import { EntityContainer } from "@/components/entity-components";
import { Button } from "@/components/ui/button";
import { mainPadding } from "@/config/constants";
import { paginationParamsLoader } from "@/features/integrations/server/params-loader";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import {
  WebhooksContainer,
  WebhooksError,
  WebhooksList,
  WebhooksLoading,
} from "@/features/webhooks/components/webhooks";
import { prefetchWebhooks } from "@/features/webhooks/server/prefetch";
import { createListPage } from "@/lib/page-factory";
import { cn } from "@/lib/utils";
import { PlusIcon } from "lucide-react";

export default createListPage({
  Container: WebhooksContainer,
  paramsLoader: paginationParamsLoader,
  prefetch: prefetchWebhooks,
  List: WebhooksList,
  Loading: WebhooksLoading,
  Error: WebhooksError,
});
