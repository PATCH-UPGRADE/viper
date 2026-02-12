import { SettingsLayout } from "@/features/settings/components/settings-layout";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return <SettingsLayout>{children}</SettingsLayout>;
};

export default Layout;
