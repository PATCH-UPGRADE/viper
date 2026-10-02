import { Suspense } from "react";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { InterruptionDrawer } from "@/features/tracking/components/interruptions/interruption-drawer";
import { InterruptionsBody } from "@/features/tracking/components/interruptions/interruptions";
import { InterruptionsHeader } from "@/features/tracking/components/interruptions/interruptions-header";
import {
  InterruptionsError,
  InterruptionsLoading,
} from "@/features/tracking/components/interruptions/interruptions-states";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

const Page = async () => {
  await requireAuth();

  return (
    <HydrateClient>
      <InterruptionsHeader />
      <ReportingErrorBoundary fallback={<InterruptionsError />}>
        <Suspense fallback={<InterruptionsLoading />}>
          <InterruptionsBody />
        </Suspense>
      </ReportingErrorBoundary>
      <InterruptionDrawer />
    </HydrateClient>
  );
};

export default Page;
