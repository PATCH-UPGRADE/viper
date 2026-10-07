import { ChatProvider } from "@/features/chat/context/chat-panel-context";
import { CsvImportProvider } from "@/features/integrations/platforms/csv-upload/components/csv-import-provider";
import LayoutInner from "./layout-client";

const Layout = ({ children }: { children: React.ReactNode }) => (
  <ChatProvider>
    <CsvImportProvider>
      <LayoutInner>{children}</LayoutInner>
    </CsvImportProvider>
  </ChatProvider>
);

export default Layout;
