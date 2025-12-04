import { IntegrationsPage } from "@/features/integrations/components/IntegrationsPage";
import { requireAuth } from "@/lib/auth-utils";

const Page = async () => {
  await requireAuth();

  return (
    <IntegrationsPage />
  );
};

export default Page;
