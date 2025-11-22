import {
  RemediationsContainer,
  RemediationsList,
  RemediationsLoading,
  RemediationsError,
} from "@/features/remediations/components/remediations";
import { remediationsParamsLoader } from "@/features/remediations/server/params-loader";
import { prefetchRemediations } from "@/features/remediations/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: remediationsParamsLoader,
  prefetch: prefetchRemediations,
  Container: RemediationsContainer,
  List: RemediationsList,
  Loading: RemediationsLoading,
  Error: RemediationsError,
});
