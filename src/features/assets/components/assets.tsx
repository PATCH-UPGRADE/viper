"use client";

import { formatDistanceToNow } from "date-fns";
import {
  CircleAlert,
  CircleArrowDown,
  CircleArrowUp,
  CircleMinus,
  ExternalLinkIcon,
  ServerIcon,
  ShieldCheck,
} from "lucide-react";
import { type PropsWithChildren, Suspense, useState } from "react";
import {
  EmptyView,
  EntityContainer,
  EntityDrawer,
  type EntityDrawerProps,
  EntityHeader,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyCode } from "@/components/ui/code";
import { DataTable } from "@/components/ui/data-table";
import {
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { QuestionTooltip } from "@/components/ui/question-tooltip";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { IssuesSidebarList } from "@/features/issues/components/issue";
import { Severity } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import type { AssetWithDeviceGroup, AssetWithIssues } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useAssetsParams } from "../hooks/use-asset-params";
import {
  useRemoveAsset,
  useSuspenseAssetIssueMetrics,
  useSuspenseAssets,
  useSuspenseAssetsDashboard,
} from "../hooks/use-assets";
import type {
  AssetIssueMetricsCounts,
  AssetWithIssueRelations,
} from "../types";
import { AssetDashboardDrawer } from "./asset-drawer";
import { columns } from "./columns";
import { assetIssueColumns, dashboardColumns } from "./dashboard-columns";

const SeveritiesExplained = {
  Critical: {
    help: "Exploitable vulnerabilities with severe impact on patient safety or data integrity.",
    icon: CircleAlert,
    color: "text-red-600",
    colorBg: "bg-red-50",
  },
  High: {
    help: "High-impact vulnerabilities requiring scheduled remediation.",
    icon: CircleArrowUp,
    color: "text-orange-600",
    colorBg: "bg-orange-50",
  },
  Medium: {
    help: "Moderate-impact vulnerabilities to address during standard patching.",
    icon: CircleMinus,
    color: "text-yellow-600",
    colorBg: "bg-yellow-50",
  },
  Low: {
    help: "Low-impact vulnerabilities with minimal risk.",
    icon: CircleArrowDown,
    color: "text-blue-600",
    colorBg: "bg-blue-50",
  },
} as const;

export const AssetIssueMetrics = ({
  data,
}: {
  data: AssetIssueMetricsCounts;
}) => {
  const severities = [
    Severity.Critical,
    Severity.High,
    Severity.Medium,
    Severity.Low,
  ] as const;

  const totalActive = severities.reduce((sum, s) => sum + data[s].active, 0);
  const totalActiveWithRem = severities.reduce(
    (sum, s) => sum + data[s].activeWithRemediations,
    0,
  );
  const totalRemediated = severities.reduce(
    (sum, s) => sum + data[s].remediated,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <h3 className="text-sm font-semibold">Active Issues</h3>
          <span className="text-xs text-muted-foreground">
            {totalActive} total &middot; {totalActiveWithRem} with remediations
            available
          </span>
        </div>
        <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-2 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs 2xl:grid-cols-4">
          {severities.map((severity) => {
            const explained = SeveritiesExplained[severity];
            const { active, activeWithRemediations } = data[severity];
            return (
              <Card
                key={severity}
                className={cn("@container/card", explained.colorBg)}
              >
                <CardHeader>
                  <CardDescription className="flex items-center gap-2 font-bold text-foreground">
                    {severity}
                    <QuestionTooltip>{explained.help}</QuestionTooltip>
                  </CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {active}
                  </CardTitle>
                  <CardAction>
                    <explained.icon className={explained.color} />
                  </CardAction>
                </CardHeader>
                <CardFooter className="flex-col items-start gap-1.5 text-sm">
                  <div className="line-clamp-1 flex gap-2 font-medium text-muted-foreground">
                    {active > 0 && (
                      <>
                        {activeWithRemediations} with remediations (
                        {((activeWithRemediations / active) * 100).toFixed(0)}%)
                      </>
                    )}
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <h3 className="text-sm font-semibold">Remediated Issues</h3>
          <span className="text-xs text-muted-foreground">
            {totalRemediated} total
          </span>
        </div>
        <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-2 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs 2xl:grid-cols-4">
          {severities.map((severity) => {
            const explained = SeveritiesExplained[severity];
            const { remediated } = data[severity];
            return (
              <Card
                key={severity}
                className={cn("@container/card", explained.colorBg)}
              >
                <CardHeader>
                  <CardDescription className="flex items-center gap-2 font-bold text-foreground">
                    {severity}
                    <QuestionTooltip>{explained.help}</QuestionTooltip>
                  </CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {remediated}
                  </CardTitle>
                  <CardAction>
                    <ShieldCheck className="text-green-600" />
                  </CardAction>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const AssetsSearch = () => {
  const [params, setParams] = useAssetsParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search assets"
    />
  );
};

export const AssetsList = () => {
  const { data: assets, isFetching } = useSuspenseAssets();
  const [asset, setAsset] = useState<AssetWithIssues | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {asset && (
        <AssetDrawer asset={asset} open={drawerOpen} setOpen={setDrawerOpen} />
      )}
      <DataTable
        paginatedData={assets}
        columns={columns}
        isLoading={isFetching}
        search={<AssetsSearch />}
        rowOnclick={(row) => {
          setDrawerOpen(true);
          setAsset(row.original);
        }}
      />
    </>
  );
};

export const AssetDashboardList = () => {
  const { data, isFetching } = useSuspenseAssetsDashboard();
  const { data: metrics } = useSuspenseAssetIssueMetrics();

  const [asset, setAsset] = useState<AssetWithIssueRelations | undefined>(
    undefined,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <AssetIssueMetrics data={metrics} />
      {asset && (
        <AssetDashboardDrawer
          asset={asset}
          open={drawerOpen}
          setOpen={setDrawerOpen}
        />
      )}
      <DataTable
        paginatedData={data}
        columns={dashboardColumns}
        nestedColumns={assetIssueColumns}
        nestedDataKey="issues"
        isLoading={isFetching}
        search={<AssetsSearch />}
        rowOnclick={(row) => {
          setDrawerOpen(true);
          setAsset(row.original);
        }}
      />
    </>
  );
};

export const AssetsHeader = ({ disabled }: { disabled?: boolean }) => {
  return (
    <EntityHeader
      title="Assets"
      description="Manage your hospital assets and devices"
      disabled={disabled}
    />
  );
};

export const AssetsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer header={<AssetsHeader />}>{children}</EntityContainer>
  );
};

export const AssetsLoading = () => {
  return <LoadingView message="Loading assets..." />;
};

export const AssetsError = () => {
  return <ErrorView message="Error loading assets" />;
};

export const AssetsEmpty = () => {
  return (
    <EmptyView message="No assets found. Assets are typically seeded using the database seed script." />
  );
};

function isAssetWithIssues(
  data: AssetWithDeviceGroup | AssetWithIssues,
): data is AssetWithIssues {
  return (data as AssetWithIssues).issues !== undefined;
}

export const AssetItem = ({
  data,
}: {
  data: AssetWithIssues | AssetWithDeviceGroup;
}) => {
  const removeAsset = useRemoveAsset();

  const handleRemove = () => {
    removeAsset.mutate({ id: data.id });
  };

  const hasIssues = isAssetWithIssues(data);

  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg">
      <div className="size-8 flex items-center justify-center">
        <ServerIcon className="size-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <AssetDrawer asset={data}>{data.role}</AssetDrawer>
        <div className="text-xs text-muted-foreground mt-1">
          {data.ip} &bull;{" "}
          {data.deviceGroup.cpe.split(":").slice(3, 5).join(" ")} &bull; Updated{" "}
          {formatDistanceToNow(data.updatedAt, { addSuffix: true })}
          {hasIssues && data.issues.length >= 1 && (
            <>
              {" "}
              &bull;{" "}
              <span className="text-red-500">
                {data.issues.length} issue(s)
              </span>
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRemove}
        disabled={removeAsset.isPending}
      >
        {removeAsset.isPending ? "Removing..." : "Remove"}
      </Button>
    </div>
  );
};

interface AssetDrawerProps extends Omit<EntityDrawerProps, "trigger"> {
  asset: AssetWithIssues | AssetWithDeviceGroup;
}

export function AssetDrawer({
  asset,
  children,
  ...props
}: PropsWithChildren<AssetDrawerProps>) {
  const hasIssues = isAssetWithIssues(asset);

  return (
    <EntityDrawer trigger={children} {...props}>
      <DrawerHeader className="gap-1">
        <DrawerTitle>{asset.role}</DrawerTitle>
        <DrawerDescription className="flex items-center gap-2">
          <Badge variant="outline">
            <ServerIcon className="size-3 mr-1" />
            Hospital Asset
          </Badge>
          <span className="text-xs">
            Updated {formatDistanceToNow(asset.updatedAt, { addSuffix: true })}
          </span>
        </DrawerDescription>
      </DrawerHeader>

      <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4 text-sm">
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

        {/* Issues */}
        {hasIssues && (
          <>
            <Separator />
            <div>
              {asset.issues.length === 0 ? (
                <>
                  <h3 className="font-semibold mb-2">Issues</h3>
                  <p className="text-xs text-muted-foreground">
                    No issues detected
                  </p>
                </>
              ) : (
                <>
                  <h3 className="font-semibold mb-2 text-destructive">
                    {asset.issues.length} active vulnerabilit
                    {asset.issues.length === 1 ? "y" : "ies"} detected
                  </h3>
                  <p className="text-xs text-muted-foreground my-2">
                    Vulnerabilities have been detected. Lab result integrity
                    compromised. Attackers could modify test results before
                    transmission to EMR, leading to incorrect diagnoses and
                    treatment. Lorem ipsum dolor asset...
                  </p>
                </>
              )}
              <Suspense fallback={<Skeleton className="h-16 w-full" />}>
                <IssuesSidebarList
                  issues={asset.issues}
                  type="vulnerabilities"
                />
              </Suspense>
            </div>
          </>
        )}

        <Separator />

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

        <Separator />

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
      </div>
    </EntityDrawer>
  );
}
