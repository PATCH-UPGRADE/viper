"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EntityContainer, EntityHeader } from "@/components/entity-components";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const SettingsHeader = () => {
  return <EntityHeader title="Settings" />;
};

export const SettingsSubheader = ({
  title,
  description,
}: {
  title: string;
  description?: string;
}) => {
  return (
    <div className="flex flex-col">
      <h2 className="text-lg md:text-xl font-semibold">{title}</h2>
      {description && (
        <p className="text-xs md:text-sm text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
};

export const SettingsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer header={<SettingsHeader />}>{children}</EntityContainer>
  );
};

export const SettingsLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const activeTab = pathname.includes("integrations")
    ? "integrations"
    : "webhooks";

  return (
    <SettingsContainer>
      <div className="container mx-auto">
        <Tabs value={activeTab} className="w-full">
          <TabsList variant="line">
            <TabsTrigger value="integrations" asChild>
              <Link href="/settings/integrations">Integrations</Link>
            </TabsTrigger>
            <TabsTrigger value="webhooks" asChild>
              <Link href="/settings/webhooks">Webhooks</Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-6">{children}</div>
      </div>
    </SettingsContainer>
  );
};
