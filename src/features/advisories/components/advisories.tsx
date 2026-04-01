"use client";

import { ComputerIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  EntityContainer,
  EntityHeader,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { StatusFormBase } from "@/components/status-form";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { Advisory, Severity, Tlp } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
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

export const AdvisoryDetailPage = ({ id }: { id: string }) => {
  const { data: advisory } = useSuspenseAdvisory(id);

  const displayTitle = advisory.title ?? advisory.id;

  return (
    <div className="mx-auto max-w-screen-lg w-full flex flex-col gap-y-8 p-8">
      {/* Header */}
      <div className="flex flex-col gap-y-1">
        <h1 className="text-2xl font-semibold">{displayTitle}</h1>
        <p className="text-xs text-muted-foreground font-mono">{advisory.id}</p>
      </div>

      {/* Status + Severity + TLP */}
      <div className="flex flex-wrap items-center gap-3">
        <AdvisoryStatusForm advisory={advisory} />
        <SeverityBadge severity={advisory.severity} />
        {advisory.tlp && <TlpBadge tlp={advisory.tlp} />}
      </div>

      {/* Summary */}
      {advisory.summary && (
        <div className="flex flex-col gap-y-1">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Summary
          </h2>
          <p className="text-sm">{advisory.summary}</p>
        </div>
      )}

      {/* Affected Assets */}
      <div className="flex flex-col gap-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Affected Assets ({advisory.affectedAssets.length})
        </h2>
        {advisory.affectedAssets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No affected assets</p>
        ) : (
          <div className="flex flex-col gap-y-2">
            {advisory.affectedAssets.map((asset) => (
              <div
                key={asset.id}
                className="flex items-center gap-3 p-3 border rounded-lg"
              >
                <ComputerIcon className="size-4 text-muted-foreground shrink-0" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium">
                    {asset.hostname ?? asset.ip}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {asset.ip}
                    {asset.role ? ` · ${asset.role}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CSAF */}
      {advisory.csaf &&
        JSON.stringify(advisory.csaf) !== JSON.stringify({}) && (
          <div className="flex flex-col gap-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              CSAF
            </h2>
            <pre className="overflow-auto text-xs bg-muted p-4 rounded max-h-[600px]">
              {JSON.stringify(advisory.csaf, null, 2)}
            </pre>
          </div>
        )}
    </div>
  );
};
