"use client";

import { formatDistanceToNow } from "date-fns";
import { BugIcon, ExternalLinkIcon } from "lucide-react";
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
import type {
  VulnerabilityWithDeviceGroups,
  VulnerabilityWithIssues,
} from "@/lib/db";
import {
  useRemoveVulnerability,
  useSuspenseVulnerabilities,
} from "../hooks/use-vulnerabilities";
import { useVulnerabilitiesParams } from "../hooks/use-vulnerabilities-params";
import { columns } from "./columns";

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
  const { data: vulnerabilities, isFetching } = useSuspenseVulnerabilities();
  const [vuln, setVuln] = useState<VulnerabilityWithIssues | undefined>(
    undefined,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {vuln && (
        <VulnerabilityDrawer
          vulnerability={vuln}
          open={drawerOpen}
          setOpen={setDrawerOpen}
        />
      )}
      <DataTable
        paginatedData={vulnerabilities}
        columns={columns}
        isLoading={isFetching}
        search={<VulnerabilitiesSearch />}
        rowOnclick={(row) => {
          setDrawerOpen(true);
          setVuln(row.original);
        }}
      />
    </>
  );
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

export const VulnerabilitiesContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer header={<VulnerabilitiesHeader />}>
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
    <EmptyView message="No vulnerabilities found. Vulnerabilities are typically seeded using the database seed script." />
  );
};

function isVulnerabilityWithIssues(
  data: VulnerabilityWithDeviceGroups | VulnerabilityWithIssues,
): data is VulnerabilityWithIssues {
  return (data as VulnerabilityWithIssues).issues !== undefined;
}

export const VulnerabilityItem = ({
  data,
}: {
  data: VulnerabilityWithIssues | VulnerabilityWithDeviceGroups;
}) => {
  const hasIssues = isVulnerabilityWithIssues(data);
  const removeVulnerability = useRemoveVulnerability();

  const handleRemove = () => {
    removeVulnerability.mutate({ id: data.id });
  };

  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg">
      <div className="size-8 flex items-center justify-center">
        <BugIcon className="size-5 text-destructive" />
      </div>
      <div className="flex-1 min-w-0">
        <VulnerabilityDrawer vulnerability={data}>
          {data.affectedDeviceGroups.map((group) => group.cpe).join(", ")}
        </VulnerabilityDrawer>
        <div className="text-xs text-muted-foreground mt-1">
          {(data.description ?? "").substring(0, 100)}
          {(data.description ?? "").length > 100 ? "..." : ""} &bull; Updated{" "}
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
        disabled={removeVulnerability.isPending}
      >
        {removeVulnerability.isPending ? "Removing..." : "Remove"}
      </Button>
    </div>
  );
};

interface VulnerabilityDrawerProps extends Omit<EntityDrawerProps, "trigger"> {
  vulnerability: VulnerabilityWithIssues | VulnerabilityWithDeviceGroups;
}

export function VulnerabilityDrawer({
  vulnerability,
  children,
  ...props
}: PropsWithChildren<VulnerabilityDrawerProps>) {
  const hasIssues = isVulnerabilityWithIssues(vulnerability);

  return (
    <EntityDrawer trigger={children} {...props}>
      <DrawerHeader className="gap-1">
        <DrawerTitle>
          {vulnerability.affectedDeviceGroups
            .map((group) => group.cpe)
            .join(", ")}
        </DrawerTitle>
        <DrawerDescription className="flex items-center gap-2">
          <Badge variant="outline" className="text-destructive">
            <BugIcon className="size-3 mr-1" />
            Vulnerability
          </Badge>
          <span className="text-xs">
            Updated{" "}
            {formatDistanceToNow(vulnerability.updatedAt, {
              addSuffix: true,
            })}
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
          {/* Issues */}
          {hasIssues && (
            <Suspense fallback={<Skeleton className="h-16 w-full" />}>
              <IssuesSidebarList issues={vulnerability.issues} type="assets" />
            </Suspense>
          )}
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
              <CopyCode>
                {vulnerability.affectedDeviceGroups
                  .map((group) => group.cpe)
                  .join(", ")}
              </CopyCode>
            </div>

            {vulnerability.exploitUri && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Exploit Repository
                </div>
                <a
                  href={vulnerability.exploitUri ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {vulnerability.exploitUri}
                  <ExternalLinkIcon className="size-3" />
                </a>
              </div>
            )}

            {vulnerability.upstreamApi && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Upstream API
                </div>
                <a
                  href={vulnerability.upstreamApi ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {vulnerability.upstreamApi}
                  <ExternalLinkIcon className="size-3" />
                </a>
              </div>
            )}
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
    </EntityDrawer>
  );
}
