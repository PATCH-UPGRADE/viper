import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ChatPanel } from "@/features/chat/components/chat-panel";
import { ChatProvider } from "@/features/chat/components/context";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <ChatProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-accent/20">{children}</SidebarInset>
        {/*TODO: make chat panel resizable*/}
        <ChatPanel />
      </SidebarProvider>
    </ChatProvider>
  );
};

export default Layout;
