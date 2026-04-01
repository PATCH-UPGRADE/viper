"use client";

import { ExternalLinkIcon, MoreVertical, SlashIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  InfoColumn,
  type InfoColumnSection,
} from "@/components/dashboard-drawers";
import {
  EntityContainer,
  EntityHeader,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { StatusFormBase } from "@/components/status-form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuestionTooltip } from "@/components/ui/question-tooltip";
import {
  assetIssueColumns,
  dashboardColumns,
} from "@/features/assets/components/dashboard-columns";
import type { AssetWithIssueRelations } from "@/features/assets/types";
import {
  type Advisory,
  IssueStatus,
  type Severity,
  type Tlp,
} from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import { parseCsaf } from "@/lib/csaf";
import {
  useSuspenseAdvisories,
  useSuspenseAdvisory,
  useUpdateAdvisoryStatus,
} from "../hooks/use-advisories";
import { useAdvisoriesParams } from "../hooks/use-advisories-params";
import { columns } from "./columns";

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

const severityConfig: Record<Severity, { label: string; className: string }> = {
  Critical: { label: "Critical", className: "bg-red-600 text-white" },
  High: { label: "High", className: "bg-orange-500 text-white" },
  Medium: { label: "Medium", className: "bg-yellow-500 text-black" },
  Low: { label: "Low", className: "bg-blue-500 text-white" },
};

export const SeverityBadge = ({ severity }: { severity: Severity }) => {
  const config = severityConfig[severity];
  return <Badge className={config.className}>{config.label}</Badge>;
};

// ---------------------------------------------------------------------------
// TLP badge — colors per https://www.first.org/tlp/
// ---------------------------------------------------------------------------

const tlpConfig: Record<Tlp, { label: string; bg: string }> = {
  RED: { label: "TLP:RED", bg: "#FF2B2B" },
  AMBER: { label: "TLP:AMBER", bg: "#FFC000" },
  AMBER_STRICT: { label: "TLP:AMBER+STRICT", bg: "#FFC000" },
  GREEN: { label: "TLP:GREEN", bg: "#33FF00" },
  CLEAR: { label: "TLP:CLEAR", bg: "#FFFFFF" },
  WHITE: { label: "TLP:WHITE", bg: "#FFFFFF" },
};

export const TlpBadge = ({ tlp }: { tlp: Tlp }) => {
  const config = tlpConfig[tlp];
  const isClear = tlp === "CLEAR" || tlp === "WHITE";
  return (
    <Badge
      style={{ backgroundColor: config.bg, color: "#000000" }}
      className={isClear ? "border border-gray-300" : ""}
    >
      {config.label}
    </Badge>
  );
};

// ---------------------------------------------------------------------------
// Advisory status form
// ---------------------------------------------------------------------------

export const AdvisoryStatusForm = ({
  advisory,
  className,
}: {
  advisory: Pick<Advisory, "id" | "status">;
  className?: string;
}) => {
  const updateAdvisoryStatus = useUpdateAdvisoryStatus();
  return (
    <StatusFormBase
      id={advisory.id}
      initialStatus={advisory.status}
      onUpdate={(input) => updateAdvisoryStatus.mutateAsync(input)}
      className={className}
    />
  );
};

// ---------------------------------------------------------------------------
// List components
// ---------------------------------------------------------------------------

export const AdvisoriesSearch = () => {
  const [params, setParams] = useAdvisoriesParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search advisories"
    />
  );
};

export const AdvisoriesList = () => {
  const { data, isFetching } = useSuspenseAdvisories();
  const router = useRouter();

  return (
    <DataTable
      paginatedData={data}
      columns={columns}
      isLoading={isFetching}
      search={<AdvisoriesSearch />}
      rowOnclick={(row) => router.push(`/advisories/${row.original.id}`)}
    />
  );
};

export const AdvisoriesHeader = () => {
  return (
    <EntityHeader
      title="Advisories"
      description="Security advisories affecting your assets"
    />
  );
};

export const AdvisoriesContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer header={<AdvisoriesHeader />}>{children}</EntityContainer>
  );
};

export const AdvisoriesLoading = () => {
  return <LoadingView message="Loading advisories..." />;
};

export const AdvisoriesError = () => {
  return <ErrorView message="Error loading advisories" />;
};

// ---------------------------------------------------------------------------
// Detail page
// ---------------------------------------------------------------------------

export const AdvisoryDetailLoading = () => {
  return <LoadingView message="Loading advisory..." />;
};

export const AdvisoryDetailError = () => {
  return <ErrorView message="Error loading advisory" />;
};

// ---------------------------------------------------------------------------
// Issue progress bar (JIRA epic style)
// ---------------------------------------------------------------------------

interface AdvisoryIssueProgressBarProps {
  issues: Array<{ status: IssueStatus }>;
  percentage: number;
}

function AdvisoryIssueProgressBar({ issues, percentage }: AdvisoryIssueProgressBarProps) {
  const total = issues.length;
  if (total === 0) return null;

  const remediated = issues.filter(
    (i) => i.status === IssueStatus.REMEDIATED,
  ).length;
  const falsePos = issues.filter(
    (i) => i.status === IssueStatus.FALSE_POSITIVE,
  ).length;
  const active = total - remediated - falsePos;

  const remediatedPct = (remediated / total) * 100;
  const falsePosPct = (falsePos / total) * 100;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Stacked bar */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted flex">
        <div
          className="h-full bg-green-500 transition-all"
          style={{ width: `${remediatedPct}%` }}
        />
        <div
          className="h-full bg-yellow-500 transition-all"
          style={{ width: `${falsePosPct}%` }}
        />
      </div>
      <span className="text-sm font-medium">
        {percentage}% remediated
      </span>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-green-500" />
          {remediated} Remediated
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-yellow-500" />
          {falsePos} False Positive
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-muted-foreground/40 inline-block size-2 rounded-full" />
          {active} Active
        </span>
        <span className="ml-auto font-medium text-foreground">
          {total} total
        </span>
      </div>
    </div>
  );
}

// Normalize CSAF baseSeverity (e.g. "CRITICAL") to Prisma Severity enum (e.g. "Critical")
function normalizeCsafSeverity(s: string | null): Severity | null {
  if (!s) return null;
  const map: Record<string, Severity> = {
    CRITICAL: "Critical",
    HIGH: "High",
    MEDIUM: "Medium",
    LOW: "Low",
  };
  return map[s.toUpperCase()] ?? null;
}

export const AdvisoryDetailPage = ({ id }: { id: string }) => {
  const { data: advisory } = useSuspenseAdvisory(id);

  const displayTitle = advisory.title ?? advisory.id;
  const parsedCsaf = parseCsaf(advisory.csaf);

  const assetsPaginated = {
    items: advisory.affectedAssetsWithIssues as AssetWithIssueRelations[],
    page: 1,
    pageSize: Math.max(advisory.affectedAssetsWithIssues.length, 1),
    totalCount: advisory.affectedAssetsWithIssues.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  const vulnItems = parsedCsaf.vulnerabilities.map((v) => ({
    value: v.cve,
    cve: v.cve,
    severity: normalizeCsafSeverity(v.severity),
    summary: v.summary,
    remediations: v.remediations,
    viperObject:
      advisory.referencedVulnerabilities.find((rv) => rv.cveId === v.cve) ??
      null,
  }));

  // Build grouped references: one item per category, links as a <ul>
  const groupedRefs = new Map<string, typeof parsedCsaf.references>();
  for (const ref of parsedCsaf.references) {
    if (!groupedRefs.has(ref.category)) groupedRefs.set(ref.category, []);
    groupedRefs.get(ref.category)!.push(ref);
  }

  const sidebarSections: InfoColumnSection[] = [
    {
      header: "Advisory Information",
      items: [
        {
          header: "Status",
          content: <AdvisoryStatusForm advisory={advisory} />,
        },
        {
          header: "Severity",
          content: <SeverityBadge severity={advisory.severity} />,
        },
        {
          header: "TLP",
          tooltip: (
            <QuestionTooltip>
              TLP (Traffic Light Protocol) is a set of designations used to
              ensure that sensitive information is shared with the appropriate
              audience. RED = recipients only, AMBER = limited sharing, GREEN =
              community-wide, WHITE/CLEAR = unlimited.
            </QuestionTooltip>
          ),
          content: advisory.tlp ? <TlpBadge tlp={advisory.tlp} /> : null,
        },
        {
          header: "Progress",
          content: (
            <span className="text-sm font-medium">
              {advisory.progressPercent}% remediated
            </span>
          ),
        },
      ],
    },
    ...(parsedCsaf.references.length > 0
      ? [
          {
            header: "References",
            items: [...groupedRefs.entries()].map(([category, refs]) => ({
              header: category,
              content: (
                <ul className="flex flex-col gap-1 pl-4 list-disc">
                  {refs.map((ref, i) => (
                    <li key={i}>
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-start gap-1"
                      >
                        {ref.summary || ref.url}
                        <ExternalLinkIcon className="size-3 mt-0.5 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              ),
            })),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-8 w-full items-start">
      {/* ── Right sidebar (top on mobile, right on lg) ── */}
      <aside className="order-first lg:order-last lg:w-80 shrink-0 sticky top-4 bg-background border-1 rounded-md">
        <InfoColumn sections={sidebarSections} className="h-auto" />
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col gap-8 min-w-0">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/advisories">All Advisories</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <SlashIcon />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>{displayTitle}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Title */}
        <h1 className="text-3xl font-semibold tracking-tight">
          {displayTitle}
        </h1>

        {/* Summary */}
        {advisory.summary && (
          <section className="flex flex-col gap-2 rounded-md border bg-background p-6">
            <h2 className="text-xl font-semibold">Summary</h2>
            <p className="text-sm text-muted-foreground">{advisory.summary}</p>
          </section>
        )}

        {/* Affected Assets */}
        <section className="flex flex-col gap-3 rounded-md border bg-background p-6">
          <h2 className="text-xl font-semibold">
            Affected Assets ({advisory.affectedAssetsWithIssues.length})
          </h2>
          {advisory.affectedAssetsWithIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No affected assets</p>
          ) : (
            <>
              <DataTable
                paginatedData={assetsPaginated}
                columns={dashboardColumns}
                nestedColumns={assetIssueColumns}
                nestedDataKey="issues"
              />
              <div className="mt-4">
                <AdvisoryIssueProgressBar
                  issues={advisory.affectedAssetsWithIssues.flatMap(
                    (a) => a.issues,
                  )}
                  percentage={advisory.progressPercent}
                />
              </div>
            </>
          )}
        </section>

        {/* Notes */}
        {parsedCsaf.notes.length > 0 && (
          <section className="flex flex-col gap-3 rounded-md border bg-background p-6">
            <h2 className="text-xl font-semibold">Notes</h2>
            <table className="w-full text-sm">
              <tbody>
                {parsedCsaf.notes.map((note, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-3 w-48 align-top">
                      <Badge variant="secondary">{note.title}</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground align-top">
                      {note.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Vulnerabilities */}
        {vulnItems.length > 0 && (
          <section className="flex flex-col gap-3 rounded-md border bg-background p-6">
            <h2 className="text-xl font-semibold">Vulnerabilities</h2>
            <Accordion type="multiple">
              {vulnItems.map((item) => (
                <AccordionItem key={item.value} value={item.value}>
                  <AccordionTrigger className="hover:no-underline">
                    <span className="flex w-full items-center gap-3">
                      <span className="font-mono text-sm">{item.cve}</span>
                      {item.severity && (
                        <SeverityBadge severity={item.severity} />
                      )}
                      {item.viperObject && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto h-7 w-7 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="sr-only">Open menu</span>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/vulnerabilities/${item.viperObject.id}`}
                              >
                                Vulnerability Detail Page
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-4 pt-2">
                      {item.summary && (
                        <div>
                          <h4 className="text-sm font-semibold mb-1">
                            Summary
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {item.summary}
                          </p>
                        </div>
                      )}
                      {item.remediations.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2">
                            Remediations
                          </h4>
                          <table className="w-full text-sm">
                            <tbody>
                              {item.remediations.map((r, i) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="py-2 pr-3 w-32 align-top">
                                    <Badge variant="secondary">
                                      {r.category}
                                    </Badge>
                                  </td>
                                  <td className="py-2 text-muted-foreground align-top">
                                    {r.details}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}
      </main>
    </div>
  );
};
