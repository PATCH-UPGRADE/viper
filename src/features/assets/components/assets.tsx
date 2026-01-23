"use client";

import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon, ServerIcon } from "lucide-react";
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
import { CopyCode } from "@/components/ui/code";
import { DataTable } from "@/components/ui/data-table";
import {
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { IssuesSidebarList } from "@/features/issues/components/issue";
import { useEntitySearch } from "@/hooks/use-entity-search";
import type { AssetWithDeviceGroup, AssetWithIssues } from "@/lib/db";
import { useAssetsParams } from "../hooks/use-asset-params";
import { useRemoveAsset, useSuspenseAssets } from "../hooks/use-assets";
import { columns } from "./columns";

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

export const AssetsHeader = ({ disabled }: { disabled?: boolean }) => {
  return (
    <EntityHeader
      title="Assets"
      description="Manage your hospital assets and devices"
      newButtonLabel="New asset"
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
