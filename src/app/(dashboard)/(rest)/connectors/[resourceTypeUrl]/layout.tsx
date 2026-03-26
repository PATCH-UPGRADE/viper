"use client";

import { ConnectorsLayout } from "@/features/api-key-connectors/components/connectors-layout";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return <ConnectorsLayout>{children}</ConnectorsLayout>;
};

export default Layout;
