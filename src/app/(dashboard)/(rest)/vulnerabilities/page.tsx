import {
  PrioritizedVulnerabilitiesList,
  VulnerabilitiesContainer,
  VulnerabilitiesError,
  VulnerabilitiesLoading,
} from "@/features/vulnerabilities/components/vulnerabilities";
import { vulnerabilitiesByPriorityParamsLoader } from "@/features/vulnerabilities/server/params-loader";
import { prefetchVulnerabilitiesByPriority } from "@/features/vulnerabilities/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: vulnerabilitiesByPriorityParamsLoader,
  prefetch: prefetchVulnerabilitiesByPriority,
  Container: VulnerabilitiesContainer,
  List: PrioritizedVulnerabilitiesList,
  Loading: VulnerabilitiesLoading,
  Error: VulnerabilitiesError,
});
