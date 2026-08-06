import {
  VendorsContainer,
  VendorsError,
  VendorsList,
  VendorsLoading,
} from "@/features/vendors/components/vendors";
import { vendorsParamsLoader } from "@/features/vendors/server/params-loader";
import { prefetchVendors } from "@/features/vendors/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: vendorsParamsLoader,
  prefetch: prefetchVendors,
  Container: VendorsContainer,
  List: VendorsList,
  Loading: VendorsLoading,
  Error: VendorsError,
});
