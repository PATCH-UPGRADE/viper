"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deviceGroupMatchingLabel } from "@/lib/markdown";
import { useSuspenseRemediation } from "../hooks/use-remediations";
import type { SourceImpact } from "../types";
import { RemediationComments } from "./remediation-comments";
import { RemediationInquiries } from "./remediation-inquiries";

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">{title}</CardTitle>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
);

/** Seconds are what the source sends; hours are what someone plans around. */
function formatDowntime(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} ${rounded === 1 ? "hour" : "hours"}`;
}

const yesNo = (value: boolean | null | undefined) =>
  value === null || value === undefined ? "Not stated" : value ? "Yes" : "No";

/**
 * What the manufacturer said about applying this, rather than what a model
 * estimated. Rendered only when a source actually answered.
 */
function ImpactSection({ impact }: { impact: SourceImpact }) {
  const rows: { label: string; value: string }[] = [
    { label: "Requires downtime", value: yesNo(impact.requiresDowntime) },
    {
      label: "Estimated downtime",
      value:
        typeof impact.estimatedDowntimeSeconds === "number"
          ? formatDowntime(impact.estimatedDowntimeSeconds)
          : "Not stated",
    },
    { label: "Restart required", value: yesNo(impact.restartRequired) },
    { label: "Disables features", value: yesNo(impact.disablesFeatures) },
  ];

  return (
    <Section title="Manufacturer impact">
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
        {impact.workflowImpact && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Workflow impact
            </p>
            <p className="text-sm whitespace-pre-wrap">
              {impact.workflowImpact}
            </p>
          </div>
        )}
        {impact.clinicalImpactNotes && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Clinical impact
            </p>
            <p className="text-sm whitespace-pre-wrap">
              {impact.clinicalImpactNotes}
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}

export const RemediationDetail = ({
  remediationId,
}: {
  remediationId: string;
}) => {
  const { data: remediation } = useSuspenseRemediation(remediationId);
  const impact = remediation.sourceImpact ?? {};
  const statedImpact = Object.values(impact).some(
    (value) => value !== null && value !== undefined && value !== "",
  );

  const title =
    remediation.description?.split("\n")[0]?.slice(0, 120) ||
    `Remediation ${remediation.id.slice(0, 8)}`;

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              {/* The list lives under connectors, not /remediations, which has
                  no page of its own. */}
              <Link href="/connectors/remediations">Remediations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate max-w-md">
              {title}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        {impact.category && (
          <Badge variant="secondary">{impact.category}</Badge>
        )}
        {impact.mechanism && (
          <Badge variant="outline">{impact.mechanism}</Badge>
        )}
        {remediation.externalMappings.map((mapping) => {
          const href = mapping.webUrl ?? mapping.upstreamApi;
          const label = mapping.integration.name;
          return href ? (
            <a
              key={mapping.externalId}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
              aria-label={`Open this remediation on ${label} in a new tab`}
            >
              {label}
              <ExternalLinkIcon className="size-3" aria-hidden="true" />
            </a>
          ) : (
            <span
              key={mapping.externalId}
              className="text-xs text-muted-foreground"
            >
              {label}
            </span>
          );
        })}
      </div>

      <Section title="Description">
        {remediation.description ? (
          <p className="text-sm whitespace-pre-wrap">
            {remediation.description}
          </p>
        ) : (
          <Empty>No description was supplied.</Empty>
        )}
      </Section>

      <Section title="How to apply it">
        {remediation.narrative ? (
          <p className="text-sm whitespace-pre-wrap">{remediation.narrative}</p>
        ) : (
          <Empty>No instructions were supplied.</Empty>
        )}
      </Section>

      {statedImpact && <ImpactSection impact={impact} />}

      <Section title="Affected devices">
        {remediation.deviceGroupMatchings.length === 0 ? (
          <Empty>This remediation is not linked to any device group.</Empty>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {remediation.deviceGroupMatchings.map((matching) => (
              <li key={matching.id}>{deviceGroupMatchingLabel(matching)}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Comments from other hospitals">
        <RemediationComments remediationId={remediationId} />
      </Section>

      <Section title="Your questions to the manufacturer">
        <RemediationInquiries remediationId={remediationId} />
      </Section>
    </div>
  );
};
