"use client";

import {
  BugIcon,
  ChevronDownIcon,
  ComputerIcon,
  CpuIcon,
  ExternalLink,
  HeartIcon,
  type LucideIcon,
  PlugIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  WorkflowIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSuspenseConnectors } from "@/features/api-key-connectors/hooks/use-connectors";
import { ResourceType } from "@/generated/prisma";
import { NavUser } from "./nav-user";
import { Separator } from "./ui/separator";

const mainItems = [
  {
    title: "Workflows",
    icon: WorkflowIcon,
    url: "/workflows",
  },
  // Hiding for now can bring it back if/when feature is ready
  // {
  //   title: "Simulations",
  //   icon: HistoryIcon,
  //   url: "/executions",
  // },
  {
    title: "Asset Dashboard",
    icon: ComputerIcon,
    url: "/assets",
  },
  {
    title: "Vulnerability Dashboard",
    icon: BugIcon,
    url: "/vulnerabilities",
  },
  {
    title: "Advisories",
    icon: ShieldAlertIcon,
    url: "/advisories",
  },
  {
    title: "Recommendations",
    icon: ShieldCheckIcon,
    url: "/recommendations",
  },
  {
    title: "Settings",
    icon: SettingsIcon,
    url: "/settings",
  },
];

interface ConnectorSidebarEntry {
  title: string;
  icon: LucideIcon;
  url: string;
  activeCount: number;
  totalCount: number;
}

export const AppSidebar = () => {
  const pathname = usePathname();
  const [connectorsOpen, setConnectorsOpen] = useState(true);
  const connectorsResult = useSuspenseConnectors();

  const connectorItems: { [type: string]: ConnectorSidebarEntry } = {
    [ResourceType.Asset]: {
      title: "Assets",
      icon: ComputerIcon,
      url: "/connectors/assets",
      activeCount: 0,
      totalCount: 0,
    },
    [ResourceType.DeviceArtifact]: {
      title: "Device Artifacts",
      icon: CpuIcon,
      url: "/connectors/deviceArtifacts",
      activeCount: 0,
      totalCount: 0,
    },
    [ResourceType.Remediation]: {
      title: "Remediations",
      icon: HeartIcon,
      url: "/connectors/remediations",
      activeCount: 0,
      totalCount: 0,
    },
    [ResourceType.Vulnerability]: {
      title: "Vulnerabilities",
      icon: BugIcon,
      url: "/connectors/vulnerabilities",
      activeCount: 0,
      totalCount: 0,
    },
  };

  let totalActiveConnectors = 0;
  for (const type of Object.values(ResourceType)) {
    if (!connectorItems[type]) {
      continue;
    }

    connectorItems[type].totalCount =
      connectorsResult.data.totalCount[type] ?? 0;
    const activeCount = connectorsResult.data.activeCount[type] ?? 0;
    connectorItems[type].activeCount = activeCount;
    totalActiveConnectors += activeCount;
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenuItem>
          <SidebarMenuButton asChild className="gap-x-4 h-10 px-4">
            <Link href="/" prefetch>
              <Image src="/logos/logo.svg" alt="Viper" width={30} height={30} />
              <span className="font-semibold text-sm">Viper</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={
                      item.url === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.url)
                    }
                    asChild
                    className="gap-x-4 h-10 px-4"
                  >
                    <Link href={item.url} prefetch>
                      <item.icon className="size-4" aria-hidden="true" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Collapsible
              open={connectorsOpen}
              onOpenChange={setConnectorsOpen}
              className="group/connectors"
            >
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  tooltip="Connectors"
                  className="gap-x-4 h-10 px-4"
                >
                  <PlugIcon className="size-4" aria-hidden="true" />
                  <span>Connectors</span>
                  <Badge variant="secondary" className="ml-auto mr-1 text-xs">
                    {totalActiveConnectors}
                  </Badge>
                  <ChevronDownIcon
                    className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/connectors:rotate-180"
                    aria-hidden="true"
                  />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenu>
                  {Object.values(connectorItems).map((item) => (
                    <SidebarMenuItem key={item.title} className="ml-4">
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={pathname.startsWith(item.url)}
                        asChild
                        className="gap-x-4 h-10 px-4"
                      >
                        <Link href={item.url} prefetch>
                          <item.icon className="size-4" aria-hidden="true" />
                          <span>{item.title}</span>
                          <span className="sr-only">
                            {item.activeCount} Active Connectors,{" "}
                            {item.totalCount} Total Connectors
                          </span>
                          <TooltipProvider delayDuration={500}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="secondary"
                                  className="ml-auto text-xs"
                                  aria-hidden="true"
                                >
                                  {item.activeCount}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent
                                className="flex flex-col"
                                animated={false}
                              >
                                <span>Active: {item.activeCount}</span>
                                <span>Total: {item.totalCount}</span>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenuItem>
        </SidebarMenu>
        <Separator className="my-2" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a
                href="/api/openapi-ui"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>OpenAPI UI</span>
                <ExternalLink className="ml-auto h-4 w-4 opacity-50" />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a
                href="/api/openapi.json"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>OpenAPI Spec</span>
                <ExternalLink className="ml-auto h-4 w-4 opacity-50" />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <NavUser />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
