import { IntegrationsLayout } from "@/features/integrations/components/integrations-layout";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return <IntegrationsLayout>{children}</IntegrationsLayout>;
};

export default Layout;
