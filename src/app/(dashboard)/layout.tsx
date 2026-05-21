import { ChatProvider } from "@/features/chat/context/chat-panel-context";
import LayoutInner from "./layout-client";

const Layout = ({ children }: { children: React.ReactNode }) => (
  <ChatProvider>
    <LayoutInner>{children}</LayoutInner>
  </ChatProvider>
);

export default Layout;
