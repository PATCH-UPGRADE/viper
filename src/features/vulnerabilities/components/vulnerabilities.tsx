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
import { useRemoveVulnerability, useSuspenseVulnerabilities } from "../hooks/use-vulnerabilities"
import { useVulnerabilitiesParams } from "../hooks/use-vulnerabilities-params";
import { useEntitySearch } from "@/hooks/use-entity-search";
import type { Vulnerability } from "@/generated/prisma";
import { AlertTriangleIcon, ExternalLinkIcon } from "lucide-react";
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

export const VulnerabilitiesSearch = () => {
  const [params, setParams] = useVulnerabilitiesParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search vulnerabilities"
    />
  );
};

export const VulnerabilitiesList = () => {
  const vulnerabilities = useSuspenseVulnerabilities();

  return (
    <EntityList
      items={vulnerabilities.data.items}
      getKey={(vulnerability) => vulnerability.id}
      renderItem={(vulnerability) => <VulnerabilityItem data={vulnerability} />}
      emptyView={<VulnerabilitiesEmpty />}
    />
  )
};

export const VulnerabilitiesHeader = ({ disabled }: { disabled?: boolean }) => {
  return (
    <EntityHeader
      title="Vulnerabilities"
      description="Manage security vulnerabilities and their clinical impact"
      newButtonLabel="New vulnerability"
      disabled={disabled}
    />
  );
};

export const VulnerabilitiesPagination = () => {
  const vulnerabilities = useSuspenseVulnerabilities();
  const [params, setParams] = useVulnerabilitiesParams();

  return (
    <EntityPagination
      disabled={vulnerabilities.isFetching}
      totalPages={vulnerabilities.data.totalPages}
      page={vulnerabilities.data.page}
      onPageChange={(page) => setParams({ ...params, page })}
    />
  );
};

export const VulnerabilitiesContainer = ({
  children
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer
      header={<VulnerabilitiesHeader />}
      search={<VulnerabilitiesSearch />}
      pagination={<VulnerabilitiesPagination />}
    >
      {children}
    </EntityContainer>
  );
};

export const VulnerabilitiesLoading = () => {
  return <LoadingView message="Loading vulnerabilities..." />;
};

export const VulnerabilitiesError = () => {
  return <ErrorView message="Error loading vulnerabilities" />;
};

export const VulnerabilitiesEmpty = () => {
  return (
    <EmptyView
      message="No vulnerabilities found. Vulnerabilities are typically seeded using the database seed script."
    />
  );
};

export const VulnerabilityItem = ({
  data,
}: {
  data: Vulnerability
}) => {
  const removeVulnerability = useRemoveVulnerability();

  const handleRemove = () => {
    removeVulnerability.mutate({ id: data.id });
  }

  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg">
      <div className="size-8 flex items-center justify-center">
        <AlertTriangleIcon className="size-5 text-destructive" />
      </div>
      <div className="flex-1 min-w-0">
        <VulnerabilityDrawer vulnerability={data} />
        <div className="text-xs text-muted-foreground mt-1">
          {data.description.substring(0, 100)}
          {data.description.length > 100 ? "..." : ""}
          {" "}&bull; Updated {formatDistanceToNow(data.updatedAt, { addSuffix: true })}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRemove}
        disabled={removeVulnerability.isPending}
      >
        {removeVulnerability.isPending ? "Removing..." : "Remove"}
      </Button>
    </div>
  )
}

function VulnerabilityDrawer({ vulnerability }: { vulnerability: Vulnerability }) {
  const isMobile = useIsMobile();

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button variant="link" className="text-foreground h-auto p-0 text-left font-medium">
          {vulnerability.cpe}
        </Button>
      </DrawerTrigger>
      <DrawerContent className={isMobile ? "" : "max-w-2xl ml-auto h-screen"}>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{vulnerability.cpe}</DrawerTitle>
          <DrawerDescription className="flex items-center gap-2">
            <Badge variant="outline" className="text-destructive">
              <AlertTriangleIcon className="size-3 mr-1" />
              Vulnerability
            </Badge>
            <span className="text-xs">
              Updated {formatDistanceToNow(vulnerability.updatedAt, { addSuffix: true })}
            </span>
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4 text-sm">
          {/* Description */}
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Description</h3>
            <p className="text-muted-foreground">{vulnerability.description}</p>
          </div>

          <Separator />

          {/* Exploit Narrative */}
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Exploit Narrative</h3>
            <p className="text-muted-foreground">{vulnerability.narrative}</p>
          </div>

          <Separator />

          {/* Clinical Impact */}
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold text-destructive">Clinical Impact</h3>
            <p className="text-muted-foreground">{vulnerability.impact}</p>
          </div>

          <Separator />

          {/* Technical Details */}
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">Technical Details</h3>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">CPE Identifier</div>
                <code className="text-xs bg-muted px-2 py-1 rounded">{vulnerability.cpe}</code>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Exploit Repository</div>
                <a
                  href={vulnerability.exploitUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {vulnerability.exploitUri}
                  <ExternalLinkIcon className="size-3" />
                </a>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Upstream API</div>
                <a
                  href={vulnerability.upstreamApi}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {vulnerability.upstreamApi}
                  <ExternalLinkIcon className="size-3" />
                </a>
              </div>
            </div>
          </div>

          <Separator />

          {/* SARIF Data */}
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">SARIF Data</h3>
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
              {JSON.stringify(vulnerability.sarif, null, 2)}
            </pre>
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
