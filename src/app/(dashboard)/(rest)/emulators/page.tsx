import {
  EmulatorsContainer,
  EmulatorsList,
  EmulatorsLoading,
  EmulatorsError,
} from "@/features/emulators/components/emulators";
import { emulatorsParamsLoader } from "@/features/emulators/server/params-loader";
import { prefetchEmulators } from "@/features/emulators/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: emulatorsParamsLoader,
  prefetch: prefetchEmulators,
  Container: EmulatorsContainer,
  List: EmulatorsList,
  Loading: EmulatorsLoading,
  Error: EmulatorsError,
});
