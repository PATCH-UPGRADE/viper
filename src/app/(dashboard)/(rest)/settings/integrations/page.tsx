import { IntegrationsCatalogContainer } from "@/features/integrations/components/integrations-catalog";
import { requireAuth } from "@/lib/auth-utils";

const Page = async () => {
  await requireAuth();

  return <IntegrationsCatalogContainer />;
};

export default Page;
