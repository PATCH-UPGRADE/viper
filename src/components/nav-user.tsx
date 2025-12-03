"use client";

import { UserIcon, EllipsisVertical, LogOutIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "./ui/skeleton";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEffect } from "react";

export function NavUser() {
  const { isMobile } = useSidebar();

  const { data: session, isPending, error } = authClient.useSession();

  useEffect(() => {
    if (error) {
      toast.error(`Error: ${error.message || "An unexpected error occurred"}`);
    }
  }, [error]);

  const user = session?.user;

  const router = useRouter();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {isPending || !user ? (
                <Skeleton className="h-8 w-8 rounded-lg" />
              ) : (
                <Avatar className="h-8 w-8 rounded-lg">
                  {user.image && user.name && (
                    <AvatarImage src={user.image} alt={user.name} />
                  )}
                  <AvatarFallback className="rounded-lg">
                    {user.name?.substring(0, 1).toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="grid flex-1 text-left text-sm leading-tight">
                {isPending || !user ? (
                  <>
                    {" "}
                    <Skeleton className="h-4 w-auto" />
                    <Skeleton className="h-4 w-auto mt-0.5" />
                  </>
                ) : (
                  <>
                    <span className="truncate font-medium">{user.name ?? "User"}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {user.email}
                    </span>
                  </>
                )}
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => router.push("/user/settings")}
              >
                <UserIcon />
                API Tokens
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      router.push("/login");
                    },
                  },
                })
              }
              className="cursor-pointer"
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
