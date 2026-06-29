import {
  NotificationsContainer,
  NotificationsError,
  NotificationsList,
  NotificationsLoading,
} from "@/features/inbox/components/notifications";
import { inboxParamsLoader } from "@/features/inbox/server/params-loader";
import { prefetchNotifications } from "@/features/inbox/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: inboxParamsLoader,
  prefetch: prefetchNotifications,
  Container: NotificationsContainer,
  List: NotificationsList,
  Loading: NotificationsLoading,
  Error: NotificationsError,
});
