"use client";

import { formatDistanceToNow } from "date-fns";
import {
  BugIcon,
  Clock,
  ExternalLinkIcon,
  Eye,
  ShieldAlert,
  ShieldClose,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssuesSidebarList } from "@/features/issues/components/issue";
import { Priority } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import type {
  VulnerabilityWithDeviceGroups,
  VulnerabilityWithIssues,
} from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  useRemoveVulnerability,
  useSuspenseVulnerabilities,
  useSuspenseVulnerabilitiesByPriority,
  useSuspenseVulnerabilityPriorityMetrics,
} from "../hooks/use-vulnerabilities";
import {
  useVulnerabilitiesByPriorityParams,
  useVulnerabilitiesParams,
} from "../hooks/use-vulnerabilities-params";
import type {
  VulnerabilitiesByPriorityCounts,
  VulnerabilityWithRelations,
} from "../types";
import { columns } from "./columns";
import { issueColumns, prioritizedColumns } from "./prioritized-columns";
import { PrioritizedVulnerabilityDrawer } from "./vulnerability-drawer";

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

const PrioritiesExplained = {
  Critical: {
    help: "Immediate remediation required. Confirmed exploitation of high-impact vulnerabilities.",
    icon: ShieldAlert,
    color: "text-red-600",
    colorBg: "bg-red-50",
    alertHeader: "Critical - Immediate Remediation",
    alertBody:
      "These vulnerabilities have confirmed exploitation of high-impact systems and require immediate action. They pose the highest risk to patient safety and data security.",
  },
  High: {
    help: "Scheduled remediation required. Predicted exploitation of high-impact vulnerabilities.",
    icon: ShieldClose,
    color: "text-orange-600",
    colorBg: "bg-orange-50",
    alertHeader: "High - Scheduled Remediation",
    alertBody:
      "These vulnerabilities indicate predicted exploitation of high-impact systems. Plan and schedule remediation activities within your next maintenance window.",
  },
  Monitor: {
    help: "Track for changes in threat landscape or impact assessment.",
    icon: Eye,
    color: "text-yellow-600",
    colorBg: "bg-yellow-50",
    alertHeader: "Monitor - Track Changes",
    alertBody:
      "These vulnerabilities should be monitored for changes in threat landscape or impact assessment. No immediate action required.",
  },
  Defer: {
    help: "Standard patching. No exploitation evidence, can be addressed through standard patching cycles.",
    icon: Clock,
    color: "text-blue-600",
    colorBg: "bg-blue-50",
    alertHeader: "Defer - Standard Patching",
    alertBody:
      "These vulnerabilities have no exploitation evidence and can be addressed through standard patching cycles.",
  },
  Unsorted: {
    help: "Not yet prioritized. Awaiting enrichment data or manual triage.",
    icon: BugIcon,
    color: "text-gray-500",
    colorBg: "bg-gray-50",
    alertHeader: "",
    alertBody: "",
  },
};

export const VulnerabilitiesByPriorityMetrics = ({
  data,
}: {
  data: VulnerabilitiesByPriorityCounts;
}) => {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-2 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs md:grid-cols-3 2xl:grid-cols-4">
      {Object.entries(data).map(([key, value]) => {
        const explained =
          PrioritiesExplained[key as keyof typeof PrioritiesExplained];
        if (key === "Unsorted" && value.total === 0) {
          return null;
        }
        return (
          <Card key={key} className={cn("@container/card", explained.colorBg)}>
            <CardHeader>
              <CardDescription className="gap-2 flex items-center font-bold text-foreground">
                {key}
                <QuestionTooltip>{explained.help}</QuestionTooltip>
              </CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {value.total}
              </CardTitle>
              <CardAction>
                {<explained.icon className={explained.color} />}
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="line-clamp-1 flex gap-2 font-medium text-muted-foreground">
                {!!value.total && (
                  <>
                    {value.withRemediations} with remediations (
                    {((value.withRemediations / value.total) * 100).toFixed(0)}
                    %)
                  </>
                )}
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
};

export const PrioritizedVulnerabilitiesList = () => {
  const { data, isFetching } = useSuspenseVulnerabilitiesByPriority();
  const { data: counts } = useSuspenseVulnerabilityPriorityMetrics();

  const [vuln, setVuln] = useState<VulnerabilityWithRelations | undefined>(
    undefined,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [params, setParams] = useVulnerabilitiesByPriorityParams();
  const { priority } = params;

  const handleTabChange = (value: string) => {
    setParams((prev) => ({ ...prev, priority: value as Priority, page: null }));
  };

  const explained =
    PrioritiesExplained[priority as keyof typeof PrioritiesExplained];

  return (
    <>
      <VulnerabilitiesByPriorityMetrics data={counts} />
      <Tabs value={priority} onValueChange={handleTabChange}>
        <TabsList variant="line">
          {Object.values(Priority).map((p) => (
            <TabsTrigger key={p} value={p}>
              <span className="font-semibold">{p}</span>
              <Badge variant="secondary" className="ml-2">
                {counts[p].total}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {vuln && (
        <PrioritizedVulnerabilityDrawer
          vulnerability={vuln}
          open={drawerOpen}
          setOpen={setDrawerOpen}
        />
      )}
      {explained.alertBody && explained.alertHeader && (
        <Alert className={explained.colorBg}>
          {<explained.icon className={explained.color} />}
          <AlertDescription className="text-foreground">
            <strong>{explained.alertHeader}</strong> {explained.alertBody}
          </AlertDescription>
        </Alert>
      )}
      <DataTable
        search={<VulnerabilitiesSearch />}
        columns={prioritizedColumns}
        paginatedData={data}
        nestedColumns={issueColumns}
        nestedDataKey="issues"
        isLoading={isFetching}
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
