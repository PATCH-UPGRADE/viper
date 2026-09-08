import { requireAuth } from "@/lib/auth-utils";

const Layout = async ({ children }: { children: React.ReactNode }) => {
  await requireAuth();

  return (
    <div className="flex h-[calc(100svh-3.5rem)] overflow-hidden">
      {children}
    </div>
  );
};

export default Layout;
