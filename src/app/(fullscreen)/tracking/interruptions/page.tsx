import Image from "next/image";
import { Suspense } from "react";
import { LoadingView } from "@/components/entity-components";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { ThemeToggle } from "@/components/theme-toggle";
import { CategoryColorProvider } from "@/features/tag-colors/context";
import { InterruptionsCalendar } from "@/features/tracking/components/interruptions/interruptions-calendar";
import { requireAuth } from "@/lib/auth-utils";

const Page = async () => {
  const { user } = await requireAuth();
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Image src="/logos/logo.svg" alt="" width={24} height={24} />
        <span className="font-semibold">Viper</span>
        <span className="h-4 w-px bg-border" />
        <span className="font-medium">Device Maintenance</span>
        <span className="hidden truncate text-sm text-muted-foreground md:block">
          Open work orders for devices in your departments.
        </span>
        <span className="ml-auto text-sm font-medium">{user.name}</span>
        <ThemeToggle />
      </header>
      <ReportingErrorBoundary
        fallback={<p className="p-4">Something went wrong.</p>}
      >
        <Suspense fallback={<LoadingView message="Loading maintenance..." />}>
          <CategoryColorProvider>
            <InterruptionsCalendar />
          </CategoryColorProvider>
        </Suspense>
      </ReportingErrorBoundary>
    </>
  );
};

export default Page;
