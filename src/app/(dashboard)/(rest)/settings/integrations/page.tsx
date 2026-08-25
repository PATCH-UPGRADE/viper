import { ErrorView } from "@/components/entity-components";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { IntegrationsCatalogContainer } from "@/features/integrations/components/integrations-catalog";
import { catalogEntries } from "@/features/integrations/core/catalog";
import { requireAuth } from "@/lib/auth-utils";

// Static (derived from the registry, not from any request), so this can be
// computed once at module load rather than per-request.
const CATALOG = catalogEntries();

const Page = async () => {
  await requireAuth();

  return (
    <ReportingErrorBoundary
      fallback={<ErrorView message="Error loading integrations" />}
    >
      <IntegrationsCatalogContainer catalog={CATALOG} />
    </ReportingErrorBoundary>
  );
};

export default Page;
