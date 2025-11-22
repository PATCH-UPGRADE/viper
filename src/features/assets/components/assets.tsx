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
  LoadingView
} from "@/components/entity-components";
import { useCreateAsset, useRemoveAsset, useSuspenseAssets } from "../hooks/use-assets"
import { useAssetsParams } from "../hooks/use-assets-params";
import { useEntitySearch } from "@/hooks/use-entity-search";
import type { Asset } from "@/generated/prisma";
import { ServerIcon } from "lucide-react";

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
    <EntityList
      items={assets.data.items}
      getKey={(asset) => asset.id}
      renderItem={(asset) => <AssetItem data={asset} />}
      emptyView={<AssetsEmpty />}
    />
  )
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
  children
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer
      header={<AssetsHeader />}
      search={<AssetsSearch />}
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
    <EmptyView
      message="No assets found. Assets are typically seeded using the database seed script."
    />
  );
};

export const AssetItem = ({
  data,
}: {
  data: Asset
}) => {
  const removeAsset = useRemoveAsset();

  const handleRemove = () => {
    removeAsset.mutate({ id: data.id });
  }

  return (
    <EntityItem
      title={data.role}
      subtitle={
        <>
          {data.ip} &bull; {data.cpe.split(':').slice(3, 5).join(' ')}
          {" "}&bull; Updated {formatDistanceToNow(data.updatedAt, { addSuffix: true })}
        </>
      }
      image={
        <div className="size-8 flex items-center justify-center">
          <ServerIcon className="size-5 text-muted-foreground" />
        </div>
      }
      onRemove={handleRemove}
      isRemoving={removeAsset.isPending}
    />
  )
}
