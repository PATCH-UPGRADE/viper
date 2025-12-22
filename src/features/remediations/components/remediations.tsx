"use client";

import { formatDistanceToNow } from "date-fns";
import { AlertTriangleIcon, ExternalLinkIcon, WrenchIcon } from "lucide-react";
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
import type { Remediation } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useRemoveRemediation,
  useSuspenseRemediations,
} from "../hooks/use-remediations";
import { useRemediationsParams } from "../hooks/use-remediations-params";

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

type RemediationWithRelations = Remediation & {
  vulnerability: {
    id: string;
    cpe: string;
    description: string;
    impact: string;
  };
};

export const RemediationItem = ({
  data,
}: {
  data: RemediationWithRelations;
}) => {
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
          {data.description.substring(0, 100)}
          {data.description.length > 100 ? "..." : ""} &bull; Updated{" "}
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
  remediation: RemediationWithRelations;
}) {
  const isMobile = useIsMobile();

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button
          variant="link"
          className="text-foreground h-auto p-0 text-left font-medium"
        >
          {remediation.cpe}
        </Button>
      </DrawerTrigger>
      <DrawerContent className={isMobile ? "" : "max-w-2xl ml-auto h-screen"}>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{remediation.cpe}</DrawerTitle>
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

          {/* Deployment Narrative */}
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Deployment Instructions</h3>
            <p className="text-muted-foreground">{remediation.narrative}</p>
          </div>

          <Separator />

          {/* Related Vulnerability */}
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold text-destructive">
              Related Vulnerability
            </h3>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangleIcon className="size-4 text-destructive" />
                <span className="font-medium text-sm">
                  {remediation.vulnerability.cpe}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {remediation.vulnerability.description}
              </p>
              <div className="text-xs">
                <span className="font-medium">Clinical Impact:</span>
                <p className="text-muted-foreground mt-1">
                  {remediation.vulnerability.impact}
                </p>
              </div>
            </div>
          </div>

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
                  {remediation.cpe}
                </code>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Fix Repository
                </div>
                <a
                  href={remediation.fixUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {remediation.fixUri}
                  <ExternalLinkIcon className="size-3" />
                </a>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Upstream API
                </div>
                <a
                  href={remediation.upstreamApi}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {remediation.upstreamApi}
                  <ExternalLinkIcon className="size-3" />
                </a>
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
