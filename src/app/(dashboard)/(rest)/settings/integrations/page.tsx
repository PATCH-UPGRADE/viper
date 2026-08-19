import { ErrorView } from "@/components/entity-components";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { IntegrationsCatalogContainer } from "@/features/integrations/components/integrations-catalog";
import { requireAuth } from "@/lib/auth-utils";

const Page = async () => {
  await requireAuth();

  return (
    <ReportingErrorBoundary
      fallback={<ErrorView message="Error loading integrations" />}
    >
      <IntegrationsCatalogContainer />
    </ReportingErrorBoundary>
  );
};

export default Page;
