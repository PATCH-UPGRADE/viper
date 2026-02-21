"use client";

import {
  BugIcon,
  ChevronDownIcon,
  ComputerIcon,
  CpuIcon,
  ExternalLink,
  HeartIcon,
  PlugIcon,
  SettingsIcon,
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

const connectorItems = [
  {
    title: "Assets",
    icon: ComputerIcon,
    url: "/connectors/assets",
    count: 1,
  },
  {
    title: "Vulnerabilities",
    icon: BugIcon,
    url: "/connectors/vulnerabilities",
    count: 1,
  },
  {
    title: "Device Artifacts",
    icon: CpuIcon,
    url: "/connectors/deviceArtifacts",
    count: 1,
  },
  {
    title: "Remediations",
    icon: HeartIcon,
    url: "/connectors/remediations",
    count: 1,
  },
];

const totalConnectors = connectorItems.reduce(
  (sum, item) => sum + item.count,
  0,
);

export const AppSidebar = () => {
  const pathname = usePathname();
  const [connectorsOpen, setConnectorsOpen] = useState(true);

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
                      <item.icon className="size-4" />
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
                    {totalConnectors}
                  </Badge>
                  <ChevronDownIcon
                    className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/connectors:rotate-180"
                    aria-hidden="true"
                  />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenu>
                  {connectorItems.map((item) => (
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
                          {/*<Badge
                            variant="secondary"
                            className="ml-auto text-xs"
                          >
                            {item.count}
                          </Badge>*/}
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
