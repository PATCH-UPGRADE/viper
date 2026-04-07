"use client";

import { formatDistanceToNow } from "date-fns";
import { AlertTriangleIcon, ExternalLinkIcon, WrenchIcon } from "lucide-react";
import Link from "next/link";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatFileSize } from "@/lib/utils";
import {
  useRemoveRemediation,
  useSuspenseRemediations,
} from "../hooks/use-remediations";
import { useRemediationsParams } from "../hooks/use-remediations-params";
import type {
  RemediationCard as RemediationCardType,
  RemediationResponse,
} from "../types";

export const RemediationsSearch = () => {
  const [params, setParams] = useRemediationsParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search remediations"
    />
  );
};

export const RemediationsList = () => {
  const remediations = useSuspenseRemediations();

  return (
    <EntityList
      items={remediations.data.items}
      getKey={(remediation) => remediation.id}
      renderItem={(remediation) => <RemediationItem data={remediation} />}
      emptyView={<RemediationsEmpty />}
    />
  );
};

export const RemediationsHeader = ({ disabled }: { disabled?: boolean }) => {
  return (
    <EntityHeader
      title="Remediations"
      description="Manage security remediations and patch deployment strategies"
      newButtonLabel="New remediation"
      disabled={disabled}
    />
  );
};

export const RemediationsPagination = () => {
  const remediations = useSuspenseRemediations();
  const [params, setParams] = useRemediationsParams();

  return (
    <EntityPagination
      disabled={remediations.isFetching}
      totalPages={remediations.data.totalPages}
      page={remediations.data.page}
      onPageChange={(page) => setParams({ ...params, page })}
    />
  );
};

export const RemediationsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer
      header={<RemediationsHeader />}
      search={<RemediationsSearch />}
      pagination={<RemediationsPagination />}
    >
      {children}
    </EntityContainer>
  );
};

export const RemediationsLoading = () => {
  return <LoadingView message="Loading remediations..." />;
};

export const RemediationsError = () => {
  return <ErrorView message="Error loading remediations" />;
};

export const RemediationsEmpty = () => {
  return (
    <EmptyView message="No remediations found. Remediations are typically seeded using the database seed script." />
  );
};

export const RemediationItem = ({ data }: { data: RemediationResponse }) => {
  const removeRemediation = useRemoveRemediation();

  const handleRemove = () => {
    removeRemediation.mutate({ id: data.id });
  };

  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg">
      <div className="size-8 flex items-center justify-center">
        <WrenchIcon className="size-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <RemediationDrawer remediation={data} />
        <div className="text-xs text-muted-foreground mt-1">
          {data.description
            ? data.description.substring(0, 100)
            : "Remediation"}
          {data.description && data.description.length > 100 ? "..." : ""}{" "}
          &bull; Updated{" "}
          {formatDistanceToNow(data.updatedAt, { addSuffix: true })}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRemove}
        disabled={removeRemediation.isPending}
      >
        {removeRemediation.isPending ? "Removing..." : "Remove"}
      </Button>
    </div>
  );
};

function RemediationDrawer({
  remediation,
}: {
  remediation: RemediationResponse;
}) {
  const isMobile = useIsMobile();

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button
          variant="link"
          className="text-foreground h-auto p-0 text-left font-medium"
        >
          {remediation.affectedDeviceGroups[0]?.cpe ?? "Unknown CPE"}
        </Button>
      </DrawerTrigger>
      <DrawerContent className={isMobile ? "" : "max-w-2xl ml-auto h-screen"}>
        <DrawerHeader className="gap-1">
          <DrawerTitle>
            {remediation.affectedDeviceGroups[0]?.cpe ?? "Unknown CPE"}
          </DrawerTitle>
          <DrawerDescription className="flex items-center gap-2">
            <Badge variant="outline" className="text-primary">
              <WrenchIcon className="size-3 mr-1" />
              Remediation
            </Badge>
            <span className="text-xs">
              Updated{" "}
              {formatDistanceToNow(remediation.updatedAt, { addSuffix: true })}
            </span>
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4 text-sm">
          {/* Description */}
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">What This Fix Does</h3>
            <p className="text-muted-foreground">{remediation.description}</p>
          </div>

          <Separator />

          {/* Narrative */}
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Narrative</h3>
            <p className="text-muted-foreground">{remediation.narrative}</p>
          </div>

          <Separator />

          {/* Related Vulnerability */}
          {remediation.vulnerability && (
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-destructive">
                Related Vulnerability
              </h3>
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangleIcon className="size-4 text-destructive" />
                  <span className="font-medium text-sm">
                    <Link href={remediation.vulnerability.url}>
                      {remediation.vulnerability.id}
                    </Link>
                  </span>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Artifacts */}
          <ArtifactsDrawerEntry artifacts={remediation.artifacts} />

          <Separator />

          {/* Technical Details */}
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">Technical Details</h3>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  CPE Identifier
                </div>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {remediation.affectedDeviceGroups[0]?.cpe ?? "N/A"}
                </code>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Upstream API
                </div>
                {remediation.upstreamApi ? (
                  <a
                    href={remediation.upstreamApi}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    {remediation.upstreamApi}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                ) : (
                  <p>None set</p>
                )}
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

export const RemediationCard = ({
  remediation,
}: {
  remediation: RemediationCardType;
}) => {
  const artifactsWithUrls = remediation.artifacts
    .map((a) => a.latestArtifact)
    .filter((a) => a != null);

  return (
    <Card key={remediation.id} className="gap-2">
      <CardHeader>
        <div className="flex items-start">
          <CardTitle className="text-base font-medium">
            <span className="font-semibold">Remediation: </span>
            {remediation.id}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {remediation.description && (
          <p className="text-sm text-muted-foreground">
            {remediation.description}
          </p>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>By {remediation.user.name}</span>
          <span>•</span>
          <span>
            {formatDistanceToNow(remediation.createdAt, {
              addSuffix: true,
            })}
          </span>
        </div>

        {artifactsWithUrls.length > 0 && (
          <div>
            <h3 className="font-semibold py-2">Artifacts</h3>
            <div className="flex flex-col gap-3">
              {artifactsWithUrls.map((artifact) => (
                <>
                  <div key={artifact.id} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {artifact.name || artifact.artifactType}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                        v{artifact.versionNumber}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {artifact.artifactType}
                      </span>
                    </div>
                    {artifact.downloadUrl && (
                      <a
                        href={artifact.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
                      >
                        {artifact.downloadUrl}
                        <ExternalLinkIcon className="size-3 flex-shrink-0" />
                      </a>
                    )}
                    {artifact.size && (
                      <span className="text-xs text-muted-foreground">
                        Size: {formatFileSize(Number(artifact.size))}
                      </span>
                    )}
                  </div>
                </>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
