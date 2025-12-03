"use client";

import {
  BugIcon,
  HeartIcon,
  ComputerIcon,
  FolderOpenIcon,
  WorkflowIcon,
  CpuIcon,
  HistoryIcon,
  KeyIcon,
  LogOutIcon,
  BookIcon,
  ExternalLink,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { authClient } from "@/lib/auth-client";
import { NavUser } from "./nav-user";
import { User } from "@/generated/prisma";

const menuItems = [
  {
    title: "Main",
    items: [
      {
        title: "Workflows",
        icon: WorkflowIcon,
        url: "/workflows",
      },
      {
        title: "Simulations",
        icon: HistoryIcon,
        url: "/executions",
      },
      {
        title: "Assets",
        icon: ComputerIcon,
        url: "/assets",
      },
      {
        title: "Emulators",
        icon: CpuIcon,
        url: "/emulators",
      },
      {
        title: "Vulnerabilities",
        icon: BugIcon,
        url: "/vulnerabilities",
      },
      {
        title: "Remediations",
        icon: HeartIcon,
        url: "/remediations",
      },
      {
        title: "Integrations",
        icon: KeyIcon,
        url: "/integrations",
      },
    ],
  },
];

export const AppSidebar = () => {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenuItem>
          <SidebarMenuButton asChild className="gap-x-4 h-10 px-4">
            <Link href="/" prefetch>
              <Image src="/logos/logo.svg" alt="Pulse" width={30} height={30} />
              <span className="font-semibold text-sm">Pulse</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarHeader>
      <SidebarContent>
        {menuItems.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
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
        ))}
      </SidebarContent>
      <SidebarFooter>
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
