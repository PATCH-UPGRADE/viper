import {
  EmulatorsContainer,
  EmulatorsList,
  EmulatorsLoading,
  EmulatorsError,
} from "@/features/emulators/components/emulators";
import { emulatorsParamsLoader } from "@/features/emulators/server/params-loader";
import { prefetchEmulators } from "@/features/emulators/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

type Props = {
  searchParams: Promise<SearchParams>;
}

const Page = async ({ searchParams }: Props) => {
  await requireAuth();

  const params = await emulatorsParamsLoader(searchParams);
  await prefetchEmulators(params);

  return (
    <EmulatorsContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<EmulatorsError />}>
          <Suspense fallback={<EmulatorsLoading />}>
            <EmulatorsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </EmulatorsContainer>
  )
};

export default Page;
