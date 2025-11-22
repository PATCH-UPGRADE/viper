import {
  AssetsContainer,
  AssetsList,
  AssetsLoading,
  AssetsError,
} from "@/features/assets/components/assets";
import { assetsParamsLoader } from "@/features/assets/server/params-loader";
import { prefetchAssets } from "@/features/assets/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: assetsParamsLoader,
  prefetch: prefetchAssets,
  Container: AssetsContainer,
  List: AssetsList,
  Loading: AssetsLoading,
  Error: AssetsError,
});
