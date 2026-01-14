"use client";

import { EntityContainer, ErrorView, LoadingView } from "@/components/entity-components";
import Link from "next/link";
import { useSuspenseAsset } from "../hooks/use-assets";
import { Badge } from "@/components/ui/badge";
import { CopyCode } from "@/components/ui/code";
import { Asset, IssueStatus } from "@/generated/prisma";
import { AssetWithIssues } from "@/lib/db";
import { BugIcon, ExternalLinkIcon, Icon, MoreVertical, ServerIcon, SlashIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabsContent } from "@radix-ui/react-tabs";
import { useSuspenseIssuesByAssetId } from "@/features/issues/hooks/use-issues";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { IssueStatusForm } from "@/features/issues/components/issue";
import { useState } from "react";
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationLink, PaginationEllipsis, PaginationNext } from "@/components/ui/pagination";

export const AssetContainer = ({ children }: { children: React.ReactNode }) => {
  return <EntityContainer>{children}</EntityContainer>;
};

export const AssetLoading = () => {
  return <LoadingView message="Loading asset..." />;
};

export const AssetError = () => {
  return <ErrorView message="Error loading asset" />;
};

function isAssetWithIssues(
	data: Asset | AssetWithIssues,
): data is AssetWithIssues {
	return (data as AssetWithIssues).issues !== undefined;
}

export const AssetDetailPage = ({ id }: { id: string }) => {
  const [currentTab, setCurrentTab] = useState("PENDING");
  const assetResult = useSuspenseAsset(id);
  console.log("asset", assetResult);
  
  const asset = assetResult.data;
  const issuesResult = useSuspenseIssuesByAssetId({ id, status: "ACTIVE" as keyof typeof IssueStatus });
  const { page, pageSize, totalCount, totalPages, items } = issuesResult.data;
  console.log("issues", issuesResult);
  const router = useRouter();

  const handleCurrentTabUpdate = (newValue: string) => {
    setCurrentTab(newValue);
  }

  return (
    <>
			<div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4 text-sm">

        {/* Asset Detail Header */}
        <div className="flex flex-col">
          <Breadcrumb className="pb-6">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/assets">All Assets</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <SlashIcon />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>{asset.role}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <h1 className="text-3xl font-semibold tracking-tight pb-2">{asset.role}</h1>

          <div className="flex items-center gap-2">
            <Badge variant="outline">
              <ServerIcon className="size-3 mr-1" />
              Hospital Asset
            </Badge>
            <span className="text-xs">
              Updated {formatDistanceToNow(asset.updatedAt, { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Left / Right Column Body */}
        <div className="flex gap-6">

          {/* Left Column - Meta Information */}
          <div className="flex flex-col gap-6">
            <Card className="p-4">
              {/* Device Information */}
              <div className="flex flex-col gap-3">
                <h3 className="font-semibold">Device Information</h3>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Role
                    </div>
                    <div className="text-sm">{asset.role}</div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      IP Address
                    </div>
                    <CopyCode>{asset.ip}</CopyCode>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Group ID
                    </div>
                    <CopyCode>{asset.cpe}</CopyCode>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              {/* API Integration */}
              <div className="flex flex-col gap-3">
                <h3 className="font-semibold">API Integration</h3>

                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Upstream API
                  </div>
                  <a
                    href={asset.upstreamApi}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
                  >
                    {asset.upstreamApi}
                    <ExternalLinkIcon className="size-3 flex-shrink-0" />
                  </a>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              {/* Metadata */}
              <div className="flex flex-col gap-3">
                <h3 className="font-semibold">Metadata</h3>
      
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Created
                    </div>
                    <div className="text-xs">
                      {formatDistanceToNow(asset.createdAt, { addSuffix: true })} (
                      {new Date(asset.createdAt).toLocaleString()})
                    </div>
                  </div>
      
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Last Updated
                    </div>
                    <div className="text-xs">
                      {formatDistanceToNow(asset.updatedAt, { addSuffix: true })} (
                      {new Date(asset.updatedAt).toLocaleString()})
                    </div>
                  </div>
      
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Asset ID
                    </div>
                    <CopyCode>{asset.id}</CopyCode>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column - Vulnerabilities List */}
          <div>
            <h2 className="text-xl font-semibold tracking-tight pb-2">Issues</h2>

            <Tabs value={currentTab} onValueChange={(v) => setCurrentTab(v)}>
              <TabsList>
                <TabsTrigger className="font-bold text-base" value="PENDING">Active ({0})</TabsTrigger>
                <TabsTrigger className="font-bold text-base" value="FALSE_POSITIVE">False Positive ({0})</TabsTrigger>
                <TabsTrigger className="font-bold text-base" value="REMEDIATED">Remediated ({0})</TabsTrigger>
              </TabsList>

              <TabsContent value="PENDING">
                {/* List of Issues */}
                <ul className="flex flex-col gap-y-2 pb-6">
                  {items.map((issue) => (
                    <li
                      key={issue.id}
                      className="flex py-3 px-4 items-center gap-4 rounded-md border-1 border-accent cursor-pointer hover:bg-muted transition-all"
                      onClick={() => router.push(`/issues/${issue.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/issues/${issue.id}`);
                        }
                      }}
                    >
                      <BugIcon className="min-w-4 min-h-4 h-4 w-4 text-destructive" size={16} />
                      
                      <div className="flex text-xs flex-1 gap-2">
                        <p className="font-semibold mb-2">{issue.vulnerability?.description}</p>
                        <IssueStatusForm issue={issue} />
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[200px]">
                          <DropdownMenuItem onClick={(e) => e.stopPropagation()} className="cursor-pointer" asChild>
                            <Link href={`/issues/${issue.id}`}>Go to Issue Details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => e.stopPropagation()} className="cursor-pointer" asChild>
                            <Link href={`/vulnerabilities/${issue.vulnerabilityId}`}>
                              Go to Vulnerability Details
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  ))}
                </ul>

                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious href="#" className="font-semibold" />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#" className="font-semibold" isActive>1</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#" className="font-semibold">2</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#" className="font-semibold">3</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationEllipsis className="font-semibold" />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext href="#" className="font-semibold" />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </TabsContent>

              <TabsContent value="FALSE_POSITIVE">
                
              </TabsContent>

              <TabsContent value="REMEDIATED">
                
              </TabsContent>
            </Tabs>

            
          </div>
        </div>

			</div>
    </>
  );
};
