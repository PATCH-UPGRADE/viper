"use client";

import { formatDistanceToNow } from "date-fns";
import {
  BugIcon,
  ExternalLinkIcon,
  MoreVertical,
  ServerIcon,
  SlashIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  EntityContainer,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyCode } from "@/components/ui/code";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssueStatusForm } from "@/features/issues/components/issue";
import { useSuspenseIssuesByAssetId } from "@/features/issues/hooks/use-issues";
import {
  type Issue,
  IssueStatus,
  type Vulnerability,
} from "@/generated/prisma";
import type { PaginatedResponse } from "@/lib/pagination";
import { useAssetDetailParams } from "../hooks/use-asset-params";
import { useSuspenseAsset } from "../hooks/use-assets";

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
  items: ({ vulnerability: Vulnerability } & Issue)[];
  page: number;
  totalPages: number;
  paramKey: string;
  onPageChange: (key: string, totalPages: number, newPageValue: number) => void;
}

const VulnList = ({
  items,
  page,
  totalPages,
  paramKey,
  onPageChange,
}: VulnListProps) => {
  const router = useRouter();

  if (items === undefined || items.length === 0) {
    return <p className="flex justify-center pt-24">No Issues found</p>;
  }

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
                  isActive={page === i + 1}
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

const issueStatusNames = {
  [IssueStatus.ACTIVE]: "Active",
  [IssueStatus.FALSE_POSITIVE]: "False Positive",
  [IssueStatus.REMEDIATED]: "Remediated",
};

interface TabulatedVulnListProps {
  assetId: string;
}

const TabulatedVulnList = ({ assetId }: TabulatedVulnListProps) => {
  const [params, setParams] = useAssetDetailParams();
  const [currentTab, setCurrentTab] = useState(params.issueStatus);

  const handleUpdateTab = (newStatus: string) => {
    const issueStatus = IssueStatus[newStatus as keyof typeof IssueStatus];
    if (issueStatus === undefined) {
      return;
    }

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

  const getPageFromParams = (status: string): number => {
    const key = `${status.toLowerCase()}Page`;
    if (key in params) {
      const page = params[key as keyof typeof params];
      if (typeof page === "number") {
        return page;
      }
    }
    return 1;
  };

  const aResult = useSuspenseIssuesByAssetId({
    assetId,
    issueStatus: IssueStatus.ACTIVE,
  });
  const fpResult = useSuspenseIssuesByAssetId({
    assetId,
    issueStatus: IssueStatus.FALSE_POSITIVE,
  });
  const rResult = useSuspenseIssuesByAssetId({
    assetId,
    issueStatus: IssueStatus.REMEDIATED,
  });

  const results: PaginatedResponse<{ vulnerability: Vulnerability } & Issue>[] =
    [];
  let showTabs = false;
  for (const res of [aResult, fpResult, rResult]) {
    results.push(res.data);
    if (res.data.totalCount > 0) {
      showTabs = true;
    }
  }

  return (
    <>
      {showTabs ? (
        <Tabs value={currentTab} onValueChange={(v) => handleUpdateTab(v)}>
          <TabsList>
            {Object.values(IssueStatus).map((status, i) => (
              <TabsTrigger
                key={i}
                className="font-bold text-base"
                value={status}
              >
                {issueStatusNames[status]} ({results[i].totalCount})
              </TabsTrigger>
            ))}
          </TabsList>

          {Object.values(IssueStatus).map((status, i) => (
            <TabsContent key={i} value={status}>
              <VulnList
                items={results[i].items}
                page={getPageFromParams(status)}
                totalPages={results[i].totalPages}
                paramKey={`${status.toLowerCase()}Page`}
                onPageChange={handlePageChange}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <p className="flex justify-center pt-24">No Active Issues</p>
      )}
    </>
  );
};

interface AssetDetailProps {
  assetId: string;
}

export const AssetDetailPage = ({ assetId }: AssetDetailProps) => {
  const assetResult = useSuspenseAsset(assetId);
  const asset = assetResult.data;

  return (
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
                    Class
                  </div>
                  <CopyCode>
                    {asset.deviceGroup.cpe.split(":").slice(3, 5).join(" ")}
                  </CopyCode>
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
          <h2 className="text-xl font-semibold tracking-tight pb-2">Issues</h2>
          <TabulatedVulnList assetId={assetId} />
        </div>
      </div>
    </div>
  );
};
