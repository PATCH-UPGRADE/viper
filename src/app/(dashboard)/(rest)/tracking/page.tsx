import {
  TrackingContainer,
  TrackingError,
  TrackingList,
  TrackingLoading,
} from "@/features/tracking/components/tracking";
import { trackingParamsLoader } from "@/features/tracking/server/params-loader";
import { prefetchTrackingTickets } from "@/features/tracking/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: trackingParamsLoader,
  prefetch: prefetchTrackingTickets,
  Container: TrackingContainer,
  List: TrackingList,
  Loading: TrackingLoading,
  Error: TrackingError,
});
