"use client";

import { formatDistanceToNow } from "date-fns";
import { DownloadIcon, ExternalLinkIcon, PackageIcon } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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
import type { Emulator } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useRemoveEmulator,
  useSuspenseEmulators,
} from "../hooks/use-emulators";
import { useEmulatorsParams } from "../hooks/use-emulators-params";
import { DeviceGroupIncludeType, UserIncludeType } from "@/lib/schemas";

type EmulatorWithRelations = Omit<Emulator, "deviceGroupId"> & {
  deviceGroup: DeviceGroupIncludeType,
  user: UserIncludeType, 
};

export const EmulatorsSearch = () => {
  const [params, setParams] = useEmulatorsParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search emulators"
    />
  );
};

export const EmulatorsList = () => {
  const emulators = useSuspenseEmulators();

  return (
    <EntityList
      items={emulators.data.items}
      getKey={(emulator) => emulator.id}
      renderItem={(emulator) => <EmulatorItem data={emulator} />}
      emptyView={<EmulatorsEmpty />}
    />
  );
};

export const EmulatorsHeader = ({ disabled }: { disabled?: boolean }) => {
  return (
    <EntityHeader
      title="Emulators"
      description="Manage device emulators for security testing and training"
      newButtonLabel="New emulator"
      disabled={disabled}
    />
  );
};

export const EmulatorsPagination = () => {
  const emulators = useSuspenseEmulators();
  const [params, setParams] = useEmulatorsParams();

  return (
    <EntityPagination
      disabled={emulators.isFetching}
      totalPages={emulators.data.totalPages}
      page={emulators.data.page}
      onPageChange={(page) => setParams({ ...params, page })}
    />
  );
};

export const EmulatorsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer
      header={<EmulatorsHeader />}
      search={<EmulatorsSearch />}
      pagination={<EmulatorsPagination />}
    >
      {children}
    </EntityContainer>
  );
};

export const EmulatorsLoading = () => {
  return <LoadingView message="Loading emulators..." />;
};

export const EmulatorsError = () => {
  return <ErrorView message="Error loading emulators" />;
};

export const EmulatorsEmpty = () => {
  return (
    <EmptyView message="No emulators found. Emulators are typically seeded using the database seed script." />
  );
};

export const EmulatorItem = ({
  data,
}: {
  data: EmulatorWithRelations;
}) => {
  const removeEmulator = useRemoveEmulator();

  const handleRemove = () => {
    removeEmulator.mutate({ id: data.id });
  };

  // Determine distribution type
  const distributionType = data.dockerUrl ? "Docker" : "Download";
  const distributionIcon = data.dockerUrl ? PackageIcon : DownloadIcon;
  const DistIcon = distributionIcon;

  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg">
      <div className="size-8 flex items-center justify-center">
        <DistIcon className="size-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <EmulatorDrawer emulator={data} />
        <div className="text-xs text-muted-foreground mt-1">
          {distributionType} &bull; {data.deviceGroup.cpe} &bull; Updated{" "}
          {formatDistanceToNow(data.updatedAt, { addSuffix: true })}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRemove}
        disabled={removeEmulator.isPending}
      >
        {removeEmulator.isPending ? "Removing..." : "Remove"}
      </Button>
    </div>
  );
};

function EmulatorDrawer({
  emulator,
}: {
  emulator: EmulatorWithRelations;
}) {
  const isMobile = useIsMobile();

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button
          variant="link"
          className="text-foreground h-auto p-0 text-left font-medium"
        >
          {emulator.role}
        </Button>
      </DrawerTrigger>
      <DrawerContent className={isMobile ? "" : "max-w-2xl ml-auto h-screen"}>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{emulator.role}</DrawerTitle>
          <DrawerDescription className="flex items-center gap-2">
            <Badge variant="outline">
              {emulator.dockerUrl ? (
                <>
                  <PackageIcon className="size-3 mr-1" />
                  Docker Image
                </>
              ) : (
                <>
                  <DownloadIcon className="size-3 mr-1" />
                  VM Download
                </>
              )}
            </Badge>
            <span className="text-xs">
              Updated{" "}
              {formatDistanceToNow(emulator.updatedAt, { addSuffix: true })}
            </span>
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4 text-sm">
          {/* Description */}
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">Description</h3>
            <p className="text-sm text-muted-foreground">
              {emulator.description}
            </p>
          </div>

          <Separator />

          {/* Distribution */}
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">Distribution</h3>

            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {emulator.dockerUrl ? "Docker Image" : "Download URL"}
              </div>
              <a
                href={emulator.dockerUrl || emulator.downloadUrl || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
              >
                {emulator.dockerUrl || emulator.downloadUrl}
                <ExternalLinkIcon className="size-3 flex-shrink-0" />
              </a>
            </div>
          </div>

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
                  {emulator.deviceGroup.cpe}
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
                  {formatDistanceToNow(emulator.createdAt, { addSuffix: true })}{" "}
                  ({new Date(emulator.createdAt).toLocaleString()})
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Last Updated
                </div>
                <div className="text-xs">
                  {formatDistanceToNow(emulator.updatedAt, { addSuffix: true })}{" "}
                  ({new Date(emulator.updatedAt).toLocaleString()})
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Emulator ID
                </div>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {emulator.id}
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
