"use client";

import { ActivityIcon, PlugIcon } from "lucide-react";
import Link from "next/link";
import { notFound, usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mainPadding } from "@/config/constants";
import {
  integrationsMapping,
  isValidResourceTypeKey,
} from "@/features/integrations/types";
import { ResourceType } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { ConnectorsHeader } from "./connectors";

export const ConnectorsLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const pathname = usePathname();
  const split = pathname.split("/");
  const resourceTypePlural = split.at(2) ?? undefined;

  if (!resourceTypePlural || !isValidResourceTypeKey(resourceTypePlural)) {
    return notFound();
  }

  const tabs = [
    {
      name: "Connectors",
      value: "connectors",
      href: `/connectors/${resourceTypePlural}`,
      icon: <PlugIcon />,
    },
    {
      name: "Items",
      value: "items",
      href: `/connectors/${resourceTypePlural}/items`,
      icon: <ActivityIcon />,
    },
  ];

  const resourceType = integrationsMapping[resourceTypePlural].type;
  const headerText =
    resourceType === ResourceType.DeviceArtifact
      ? "Device Artifact"
      : resourceType.toString();
  const activeTab = pathname.includes(tabs[1].value)
    ? tabs[1].value
    : tabs[0].value;

  return (
    <div
      className={cn(
        mainPadding,
        "px-20 bg-background flex flex-col gap-4 border-b",
      )}
    >
      <ConnectorsHeader title={headerText} />

      <Tabs value={activeTab} className="w-full flex flex-row! justify-between">
        <TabsList variant="line">
          {tabs.map((tab) => (
            <TabsTrigger value={tab.value} key={tab.value} asChild>
              <Link
                href={tab.href}
                className="data-[state=active]:text-primary!  [&[data-state=active]]:after:bg-primary!"
              >
                {tab.icon}
                {tab.name}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div>{children}</div>
    </div>
  );
};
