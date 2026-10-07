// A shell with no sidebar, for pages meant to fill the screen. It sits beside
// (dashboard) rather than inside it, because the sidebar is rendered by
// (dashboard)/layout-client.tsx. Pages here call requireAuth() themselves.
const Layout = ({ children }: { children: React.ReactNode }) => (
  <main className="flex h-screen flex-col bg-background">{children}</main>
);

export default Layout;
