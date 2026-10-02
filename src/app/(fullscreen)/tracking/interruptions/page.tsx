import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { InterruptionsCalendar } from "@/features/tracking/components/interruptions/interruptions-calendar";
import { requireAuth } from "@/lib/auth-utils";

const Page = async () => {
  await requireAuth();
  return (
    <ReportingErrorBoundary
      fallback={<p className="p-4">Something went wrong.</p>}
    >
      <InterruptionsCalendar />
    </ReportingErrorBoundary>
  );
};

export default Page;
