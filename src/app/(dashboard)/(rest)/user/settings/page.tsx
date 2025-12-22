import {
  ApiTokensContainer,
  ApiTokensError,
  ApiTokensList,
  ApiTokensLoading,
} from "@/features/user/components/user";
import { apiTokensParamsLoader } from "@/features/user/server/params-loader";
import { prefetchApiTokens } from "@/features/user/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: apiTokensParamsLoader,
  prefetch: prefetchApiTokens,
  Container: ApiTokensContainer,
  List: ApiTokensList,
  Loading: ApiTokensLoading,
  Error: ApiTokensError,
});
