"use client";

import { formatDistanceToNow } from "date-fns";
import {
  EmptyView,
  EntityContainer,
  EntityHeader,
  EntityItem,
  EntityList,
  EntityPagination,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import {
  useCreateAsset,
  useRemoveAsset,
  useSuspenseAssets,
} from "../hooks/use-assets";
import { useAssetsParams } from "../hooks/use-assets-params";
import { useEntitySearch } from "@/hooks/use-entity-search";
import type { Asset } from "@/generated/prisma";
import { ServerIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AssetWithIssues } from "@/lib/db";
import Link from "next/link";
import {
  IssuesSidebarList,
  IssueStatusBadge,
} from "@/features/issues/components/issue";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import { CopyCode } from "@/components/ui/code";

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
  const assets = useSuspenseAssets();

  return (
    <DataTable
      paginatedData={assets.data}
      columns={columns}
      search={<AssetsSearch />}
    />
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

export const AssetsPagination = () => {
  const assets = useSuspenseAssets();
  const [params, setParams] = useAssetsParams();

  return (
    <EntityPagination
      disabled={assets.isFetching}
      totalPages={assets.data.totalPages}
      page={assets.data.page}
      onPageChange={(page) => setParams({ ...params, page })}
    />
  );
};

export const AssetsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer
      header={<AssetsHeader />}
      pagination={<AssetsPagination />}
    >
      {children}
    </EntityContainer>
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
  data: Asset | AssetWithIssues,
): data is AssetWithIssues {
  return (data as AssetWithIssues).issues !== undefined;
}

export const AssetItem = ({ data }: { data: AssetWithIssues | Asset }) => {
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
        <AssetDrawer asset={data} />
        <div className="text-xs text-muted-foreground mt-1">
          {data.ip} &bull; {data.cpe.split(":").slice(3, 5).join(" ")} &bull;
          Updated {formatDistanceToNow(data.updatedAt, { addSuffix: true })}
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

export function AssetDrawer({ asset }: { asset: AssetWithIssues | Asset }) {
  const isMobile = useIsMobile();
  const hasIssues = isAssetWithIssues(asset);

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button
          variant="link"
          className="text-foreground h-auto p-0 text-left font-medium"
        >
          {asset.role}
        </Button>
      </DrawerTrigger>
      <DrawerContent className={isMobile ? "" : "max-w-2xl ml-auto h-screen"}>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{asset.role}</DrawerTitle>
          <DrawerDescription className="flex items-center gap-2">
            <Badge variant="outline">
              <ServerIcon className="size-3 mr-1" />
              Hospital Asset
            </Badge>
            <span className="text-xs">
              Updated{" "}
              {formatDistanceToNow(asset.updatedAt, { addSuffix: true })}
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
                <CopyCode>{asset.cpe}</CopyCode>
              </div>
            </div>
          </div>

          {/* Issues */}
          {hasIssues && (
            <>
              <Separator />
              <IssuesSidebarList issues={asset.issues} />
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

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
