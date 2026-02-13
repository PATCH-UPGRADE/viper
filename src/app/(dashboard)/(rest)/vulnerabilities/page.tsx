import {
  PrioritizedVulnerabilitiesList,
  VulnerabilitiesContainer,
  VulnerabilitiesError,
  VulnerabilitiesList,
  VulnerabilitiesLoading,
} from "@/features/vulnerabilities/components/vulnerabilities";
import { vulnerabilitiesParamsLoader } from "@/features/vulnerabilities/server/params-loader";
import { prefetchVulnerabilities } from "@/features/vulnerabilities/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: vulnerabilitiesParamsLoader,
  prefetch: prefetchVulnerabilities,
  Container: VulnerabilitiesContainer,
  //List: VulnerabilitiesList,
  List: PrioritizedVulnerabilitiesList,
  Loading: VulnerabilitiesLoading,
  Error: VulnerabilitiesError,
});
