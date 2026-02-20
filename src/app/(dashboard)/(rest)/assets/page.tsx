import {
  AssetDashboardList,
  AssetsContainer,
  AssetsError,
  AssetsLoading,
} from "@/features/assets/components/assets";
import { assetsParamsLoader } from "@/features/assets/server/params-loader";
import { prefetchAssetsDashboard } from "@/features/assets/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: assetsParamsLoader,
  prefetch: prefetchAssetsDashboard,
  Container: AssetsContainer,
  List: AssetDashboardList,
  Loading: AssetsLoading,
  Error: AssetsError,
});
