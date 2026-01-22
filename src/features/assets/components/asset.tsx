"use client";

import {
  EntityContainer,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import Link from "next/link";
import { useSuspenseAsset } from "../hooks/use-assets";
import { Badge } from "@/components/ui/badge";
import { CopyCode } from "@/components/ui/code";
import { IssueStatus } from "@/generated/prisma";
import {
  BugIcon,
  ExternalLinkIcon,
  MoreVertical,
  ServerIcon,
  SlashIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabsContent } from "@radix-ui/react-tabs";
import { useSuspenseIssuesByAssetId } from "@/features/issues/hooks/use-issues";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { IssueStatusForm } from "@/features/issues/components/issue";
import { useState } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationLink,
  PaginationNext,
} from "@/components/ui/pagination";
import { useAssetDetailParams } from "../hooks/use-asset-detail-params";

export const AssetContainer = ({ children }: { children: React.ReactNode }) => {
  return <EntityContainer>{children}</EntityContainer>;
};

export const AssetLoading = () => {
  return <LoadingView message="Loading asset..." />;
};

export const AssetError = () => {
  return <ErrorView message="Error loading asset" />;
};

interface VulnListProps {
  items: any[];
  page: number;
  totalPages: number;
  paramKey: string;
  onPageChange: Function;
}

const VulnList = ({
  items,
  page,
  totalPages,
  paramKey,
  onPageChange,
}: VulnListProps) => {
  if (items == undefined || items.length == 0) {
    return <p className="flex justify-center pt-24">No Issues found</p>;
  }

  const router = useRouter();

  return (
    <>
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
            <BugIcon
              className="min-w-4 min-h-4 h-4 w-4 text-destructive"
              size={16}
            />

            <div className="flex flex-1 justify-between gap-2">
              <p className="font-semibold">
                {issue.vulnerability?.description}
              </p>
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
                <DropdownMenuItem
                  onClick={(e) => e.stopPropagation()}
                  className="cursor-pointer"
                  asChild
                >
                  <Link href={`/issues/${issue.id}`}>Go to Issue Details</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => e.stopPropagation()}
                  className="cursor-pointer"
                  asChild
                >
                  <Link href={`/vulnerabilities/${issue.vulnerabilityId}`}>
                    Go to Vulnerability Details
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                className="font-semibold"
                onClick={() => onPageChange(paramKey, totalPages, page - 1)}
              />
            </PaginationItem>

            {[...Array(totalPages)].map((_, i) => (
              <PaginationItem key={i}>
                <PaginationLink
                  className="font-semibold"
                  isActive={page == i + 1}
                  onClick={() => onPageChange(paramKey, totalPages, i + 1)}
                >
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}

            <PaginationItem>
              <PaginationNext
                className="font-semibold"
                onClick={() => onPageChange(paramKey, totalPages, page + 1)}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </>
  );
};

interface TabulatedVulnListProps {
  id: string;
}

const TabulatedVulnList = ({ id }: TabulatedVulnListProps) => {
  const [params, setParams] = useAssetDetailParams();
  const [currentTab, setCurrentTab] = useState(params.issueStatus);

  const handleUpdateTab = (issueStatus: string) => {
    setParams({ ...params, issueStatus });
    setCurrentTab(issueStatus);
  };

  const handlePageChange = (
    key: string,
    totalPages: number,
    newPageValue: number,
  ) => {
    if (1 > newPageValue || newPageValue > totalPages) {
      return;
    }

    setParams({ ...params, [key]: newPageValue });
  };

  const activeIssues = useSuspenseIssuesByAssetId({
    id,
    issueStatus: IssueStatus.PENDING,
  });
  const falsePositiveIssues = useSuspenseIssuesByAssetId({
    id,
    issueStatus: IssueStatus.FALSE_POSITIVE,
  });
  const remediatedIssues = useSuspenseIssuesByAssetId({
    id,
    issueStatus: IssueStatus.REMEDIATED,
  });

  return (
    <>
      {activeIssues.data.totalCount > 0 ||
      falsePositiveIssues.data.totalCount > 0 ||
      remediatedIssues.data.totalCount > 0 ? (
        <Tabs value={currentTab} onValueChange={(v) => handleUpdateTab(v)}>
          <TabsList>
            <TabsTrigger className="font-bold text-base" value="PENDING">
              Active ({activeIssues.data.totalCount})
            </TabsTrigger>
            <TabsTrigger className="font-bold text-base" value="FALSE_POSITIVE">
              False Positive ({falsePositiveIssues.data.totalCount})
            </TabsTrigger>
            <TabsTrigger className="font-bold text-base" value="REMEDIATED">
              Remediated ({remediatedIssues.data.totalCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="PENDING">
            <VulnList
              items={activeIssues.data.items}
              page={params.activeIssuePage}
              totalPages={activeIssues.data.totalPages}
              paramKey={"activeIssuePage"}
              onPageChange={handlePageChange}
            />
          </TabsContent>

          <TabsContent value="FALSE_POSITIVE">
            <VulnList
              items={falsePositiveIssues.data.items}
              page={params.falsePosIssuePage}
              totalPages={falsePositiveIssues.data.totalPages}
              paramKey={"falsePosIssuePage"}
              onPageChange={handlePageChange}
            />
          </TabsContent>

          <TabsContent value="REMEDIATED">
            <VulnList
              items={remediatedIssues.data.items}
              page={params.remediatedIssuePage}
              totalPages={remediatedIssues.data.totalPages}
              paramKey={"remediatedIssuePage"}
              onPageChange={handlePageChange}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <p className="flex justify-center pt-24">No Active Issues</p>
      )}
    </>
  );
};

export const AssetDetailPage = ({ id }: { id: string }) => {
  const assetResult = useSuspenseAsset(id);
  const asset = assetResult.data;

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

          <h1 className="text-3xl font-semibold tracking-tight pb-2">
            {asset.role}
          </h1>

          <div className="flex items-center gap-2">
            <Badge variant="outline">
              <ServerIcon className="size-3 mr-1" />
              Hospital Asset
            </Badge>
            <span className="text-xs">
              Updated{" "}
              {formatDistanceToNow(asset.updatedAt, { addSuffix: true })}
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
                    <CopyCode>{asset.deviceGroup.cpe}</CopyCode>
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
                      {formatDistanceToNow(asset.createdAt, {
                        addSuffix: true,
                      })}{" "}
                      ({new Date(asset.createdAt).toLocaleString()})
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Last Updated
                    </div>
                    <div className="text-xs">
                      {formatDistanceToNow(asset.updatedAt, {
                        addSuffix: true,
                      })}{" "}
                      ({new Date(asset.updatedAt).toLocaleString()})
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
          <div className="flex-grow">
            <h2 className="text-xl font-semibold tracking-tight pb-2">
              Issues
            </h2>
            <TabulatedVulnList id={id} />
          </div>
        </div>
      </div>
    </>
  );
};
