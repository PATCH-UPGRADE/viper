"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EntityContainer, EntityHeader } from "@/components/entity-components";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { headerClass, mainPadding } from "@/config/constants";
import { cn } from "@/lib/utils";
import { PlugIcon, WebhookIcon } from "lucide-react";

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

export const SettingsLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const activeTab = pathname.includes("integrations")
    ? "integrations"
    : "webhooks";

  // path and name for tab
  const tabs = [["integrations", <><PlugIcon /> Integrations</>], ["webhooks", <><WebhookIcon /> Webhooks</>]]

  return (
    <div>
      <div className={cn(mainPadding, "bg-background flex flex-col gap-4 border-b")}>
      <h1 className={cn(headerClass, "text-2xl! font-bold")}>Settings</h1>
      <Tabs value={activeTab} className="w-full">
        <TabsList variant="line" className="gap-4">
          {tabs.map(([path, name]) => (
          <TabsTrigger value={path} key={path} asChild>
            <Link href={`/settings/${path}`} className="data-[state=active]:text-primary!  [&[data-state=active]]:after:bg-primary! font-semibold">{name}</Link>
          </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      </div>

      <div>{children}</div>
    </div>
  );
};
