"use client";

import { formatDistanceToNow } from "date-fns";
import { DownloadIcon } from "lucide-react";
import {
  EmptyView,
  EntityContainer,
  EntityHeader,
  EntityList,
  EntityPagination,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
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
import { Separator } from "@/components/ui/separator";
import { ArtifactsDrawerEntry } from "@/features/artifacts/components/artifacts";
import { useEntitySearch } from "@/hooks/use-entity-search";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useRemoveDeviceArtifact,
  useSuspenseDeviceArtifacts,
} from "../hooks/use-device-artifacts";
import { useDeviceArtifactsParams } from "../hooks/use-device-artifacts-params";
import type { DeviceArtifactResponse } from "../types";

export const DeviceArtifactsSearch = () => {
  const [params, setParams] = useDeviceArtifactsParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search device artifacts"
    />
  );
};

export const DeviceArtifactsList = () => {
  const deviceArtifacts = useSuspenseDeviceArtifacts();

  return (
    <EntityList
      items={deviceArtifacts.data.items}
      getKey={(deviceArtifact) => deviceArtifact.id}
      renderItem={(deviceArtifact) => (
        <DeviceArtifactItem data={deviceArtifact} />
      )}
      emptyView={<DeviceArtifactsEmpty />}
    />
  );
};

export const DeviceArtifactsHeader = ({ disabled }: { disabled?: boolean }) => {
  return (
    <EntityHeader
      title="Device Artifacts"
      description="Manage device artifacts for security testing and training"
      newButtonLabel="New device artifact"
      disabled={disabled}
    />
  );
};

export const DeviceArtifactsPagination = () => {
  const deviceArtifacts = useSuspenseDeviceArtifacts();
  const [params, setParams] = useDeviceArtifactsParams();

  return (
    <EntityPagination
      disabled={deviceArtifacts.isFetching}
      totalPages={deviceArtifacts.data.totalPages}
      page={deviceArtifacts.data.page}
      onPageChange={(page) => setParams({ ...params, page })}
    />
  );
};

export const DeviceArtifactsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer
      header={<DeviceArtifactsHeader />}
      search={<DeviceArtifactsSearch />}
      pagination={<DeviceArtifactsPagination />}
    >
      {children}
    </EntityContainer>
  );
};

export const DeviceArtifactsLoading = () => {
  return <LoadingView message="Loading Device Artifacts..." />;
};

export const DeviceArtifactsError = () => {
  return <ErrorView message="Error loading Device Artifacts" />;
};

export const DeviceArtifactsEmpty = () => {
  return (
    <EmptyView message="No device artifacts found. Device artifacts are typically seeded using the database seed script." />
  );
};

export const DeviceArtifactItem = ({
  data,
}: {
  data: DeviceArtifactResponse;
}) => {
  const removeDeviceArtifact = useRemoveDeviceArtifact();

  const handleRemove = () => {
    removeDeviceArtifact.mutate({ id: data.id });
  };

  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg">
      <div className="size-8 flex items-center justify-center">
        <DownloadIcon className="size-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <DeviceArtifactDrawer deviceArtifact={data} />
        <div className="text-xs text-muted-foreground mt-1">
          {data.deviceGroup.cpe} &bull; Updated{" "}
          {formatDistanceToNow(data.updatedAt, { addSuffix: true })}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRemove}
        disabled={removeDeviceArtifact.isPending}
      >
        {removeDeviceArtifact.isPending ? "Removing..." : "Remove"}
      </Button>
    </div>
  );
};

function DeviceArtifactDrawer({
  deviceArtifact,
}: {
  deviceArtifact: DeviceArtifactResponse;
}) {
  const isMobile = useIsMobile();

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button
          variant="link"
          className="text-foreground h-auto p-0 text-left font-medium"
        >
          {deviceArtifact.role || "Device Artifact"} &bull;{" "}
          {`${deviceArtifact.artifacts.length} Artifact(s)`}
        </Button>
      </DrawerTrigger>
      <DrawerContent className={isMobile ? "" : "max-w-2xl ml-auto h-screen"}>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{deviceArtifact.role || "Device Artifact"}</DrawerTitle>
          <DrawerDescription className="flex items-center gap-2">
            <span className="text-xs">
              Updated{" "}
              {formatDistanceToNow(deviceArtifact.updatedAt, {
                addSuffix: true,
              })}
            </span>
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4 text-sm">
          {/* Description */}
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">Description</h3>
            <p className="text-sm text-muted-foreground">
              {deviceArtifact.description}
            </p>
          </div>

          <Separator />

          {/* Artifacts */}
          <ArtifactsDrawerEntry artifacts={deviceArtifact.artifacts} />

          <Separator />

          {/* Associated Device Group */}
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">Associated Device Group</h3>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  CPE Identifier
                </div>
                <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                  {deviceArtifact.deviceGroup.cpe}
                </code>
              </div>
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
                  {formatDistanceToNow(deviceArtifact.createdAt, {
                    addSuffix: true,
                  })}{" "}
                  ({new Date(deviceArtifact.createdAt).toLocaleString()})
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Last Updated
                </div>
                <div className="text-xs">
                  {formatDistanceToNow(deviceArtifact.updatedAt, {
                    addSuffix: true,
                  })}{" "}
                  ({new Date(deviceArtifact.updatedAt).toLocaleString()})
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Device Artifact ID
                </div>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {deviceArtifact.id}
                </code>
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
