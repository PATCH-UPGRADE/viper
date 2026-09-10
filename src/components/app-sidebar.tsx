"use client";

import {
  BugIcon,
  ChevronDownIcon,
  ComputerIcon,
  CpuIcon,
  DatabaseIcon,
  ExternalLink,
  FileTextIcon,
  HeartIcon,
  HomeIcon,
  InboxIcon,
  LayoutGridIcon,
  ListChecksIcon,
  type LucideIcon,
  SettingsIcon,
  Sparkles,
  WorkflowIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useChatUI } from "@/features/chat/context/chat-panel-context";
import { NavUser } from "./nav-user";
import { Separator } from "./ui/separator";

type NavItem = {
  title: string;
  icon: LucideIcon;
  url: string;
};

const homeItems: NavItem[] = [
  {
    title: "Overview",
    icon: LayoutGridIcon,
    url: "/overview",
  },
  {
    title: "Inbox",
    icon: InboxIcon,
    url: "/inbox",
  },
  {
    title: "Work Orders",
    icon: ListChecksIcon,
    url: "/tracking",
  },
];

const mainItems: NavItem[] = [
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
    title: "Reports",
    icon: FileTextIcon,
    url: "/reports",
  },
  {
    title: "Settings",
    icon: SettingsIcon,
    url: "/settings",
  },
];

const SidebarNavItem = ({ item }: { item: NavItem }) => {
  const pathname = usePathname();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={item.title}
        isActive={
          pathname === item.url ||
          (item.url !== "/" && pathname.startsWith(`${item.url}/`))
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
  );
};

const tableItems: NavItem[] = [
  {
    title: "Assets",
    icon: ComputerIcon,
    url: "/tables/assets",
  },
  {
    title: "Device Artifacts",
    icon: CpuIcon,
    url: "/tables/deviceArtifacts",
  },
  {
    title: "Remediations",
    icon: HeartIcon,
    url: "/tables/remediations",
  },
  {
    title: "Vulnerabilities",
    icon: BugIcon,
    url: "/tables/vulnerabilities",
  },
];

export const AppSidebar = () => {
  const pathname = usePathname();
  const [tablesOpen, setTablesOpen] = useState(false);
  const { toggleChatPanel } = useChatUI();

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
          <SidebarGroupContent className="rounded-lg border bg-sidebar-accent/40 p-1">
            <SidebarGroupLabel className="gap-x-2 px-3">
              <HomeIcon className="size-4" aria-hidden="true" />
              <span>Home</span>
            </SidebarGroupLabel>
            <SidebarMenu>
              {homeItems.map((item) => (
                <SidebarNavItem key={item.title} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarNavItem key={item.title} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Collapsible
              open={tablesOpen}
              onOpenChange={setTablesOpen}
              className="group/tables"
            >
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  tooltip="DB Tables"
                  className="gap-x-4 h-10 px-4"
                >
                  <DatabaseIcon className="size-4" aria-hidden="true" />
                  <span>DB Tables</span>
                  <ChevronDownIcon
                    className="ml-auto size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/tables:rotate-180"
                    aria-hidden="true"
                  />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenu>
                  {tableItems.map((item) => (
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
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="gap-x-4 h-10 px-4 cursor-pointer"
              tooltip="Ask VIPER"
              onClick={toggleChatPanel}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") toggleChatPanel();
              }}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              <span>Ask VIPER</span>
            </SidebarMenuButton>
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
