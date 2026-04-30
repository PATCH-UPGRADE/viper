import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ChatPanel, ChatProvider } from "@/features/chat/components/chat";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <ChatProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-accent/20">{children}</SidebarInset>
      </SidebarProvider>
      <ChatPanel />
    </ChatProvider>
  );
};

export default Layout;
