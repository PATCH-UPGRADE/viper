import { ChatProvider } from "@/features/chat/context/chat-panel-context";
import { CsvImportProvider } from "@/features/integrations/platforms/csv-upload/components/csv-import-provider";
import { FeaturesProvider } from "@/lib/features/client";
import { getFeatures } from "@/lib/features/server";
import LayoutInner from "./layout-client";

const Layout = ({ children }: { children: React.ReactNode }) => (
  <FeaturesProvider features={getFeatures()}>
    <ChatProvider>
      <CsvImportProvider>
        <LayoutInner>{children}</LayoutInner>
      </CsvImportProvider>
    </ChatProvider>
  </FeaturesProvider>
);

export default Layout;
