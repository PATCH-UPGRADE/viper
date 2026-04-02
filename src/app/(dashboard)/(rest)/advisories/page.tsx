import {
  AdvisoriesContainer,
  AdvisoriesError,
  AdvisoriesList,
  AdvisoriesLoading,
} from "@/features/advisories/components/advisories";
import { advisoriesParamsLoader } from "@/features/advisories/server/params-loader";
import { prefetchAdvisories } from "@/features/advisories/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: advisoriesParamsLoader,
  prefetch: prefetchAdvisories,
  Container: AdvisoriesContainer,
  List: AdvisoriesList,
  Loading: AdvisoriesLoading,
  Error: AdvisoriesError,
});
