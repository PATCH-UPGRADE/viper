import {
  PrioritizedVulnerabilitiesList,
  VulnerabilitiesContainer,
  VulnerabilitiesError,
  VulnerabilitiesLoading,
} from "@/features/vulnerabilities/components/vulnerabilities";
import { vulnerabilitiesBySeverityParamsLoader } from "@/features/vulnerabilities/server/params-loader";
import { prefetchVulnerabilitiesBySeverity } from "@/features/vulnerabilities/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: vulnerabilitiesBySeverityParamsLoader,
  prefetch: prefetchVulnerabilitiesBySeverity,
  Container: VulnerabilitiesContainer,
  List: PrioritizedVulnerabilitiesList,
  Loading: VulnerabilitiesLoading,
  Error: VulnerabilitiesError,
});
