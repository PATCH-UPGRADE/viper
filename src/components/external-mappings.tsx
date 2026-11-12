"use client";

import { ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { UrlBearingMapping } from "@/features/integrations/core/urls";
import { PlatformEnum } from "@/generated/prisma";
import { relativeTime } from "@/lib/date-utils";

/**
 * The common shape of every `External*Mapping` select in the app.
 */
export interface ExternalMappingLike extends UrlBearingMapping {
  externalId: string;
  integration: { id: string; name: string; platform?: PlatformEnum };
  lastSynced?: Date | null;
}

const PLATFORM_TAGS: Partial<Record<PlatformEnum, string>> = {
  [PlatformEnum.CSV_UPLOAD]: "CSV",
};

/** The small tag shown after an integration's name, e.g. "CSV" for a CSV import. */
export const platformTagOf = (platform?: PlatformEnum) =>
  platform ? PLATFORM_TAGS[platform] : undefined;

/** A mapping's links for a SourceList row: its page in the integration, then its upstream API. */
export const mappingLinks = (
  mapping: UrlBearingMapping | null | undefined,
): { label: string; href: string }[] => [
  ...(mapping?.webUrl ? [{ label: "Web", href: mapping.webUrl }] : []),
  ...(mapping?.upstreamApi
    ? [{ label: "API", href: mapping.upstreamApi }]
    : []),
];

const MappingLink = ({ label, href }: { label: string; href: string }) => (
  <>
    <div className="text-xs font-medium text-muted-foreground mb-1">
      {label}
    </div>
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
    >
      {href}
      <ExternalLinkIcon className="size-3 shrink-0" />
    </a>
  </>
);

/**
 * One row per integration this record is mapped into, with that mapping's own
 * urls. Both fields arrive already resolved against the owning platform's
 * resource module by `mappingUrlExtension`
 */
export const ExternalMappingList = ({
  mappings,
  emptyMessage,
}: {
  mappings: readonly ExternalMappingLike[];
  emptyMessage?: ReactNode;
}) => {
  if (mappings.length === 0) {
    return emptyMessage ?? null;
  }

  return (
    <ul className="space-y-3">
      {mappings.map((mapping) => {
        const { webUrl, upstreamApi } = mapping;
        const platformTag = platformTagOf(mapping.integration.platform);

        return (
          <li
            key={`${mapping.integration.id}:${mapping.externalId}`}
            className="text-sm flex flex-col gap-1"
          >
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {mapping.integration.name}
              {platformTag && <Badge variant="outline">{platformTag}</Badge>}
            </span>
            {mapping.lastSynced && (
              <span className="text-xs text-muted-foreground">
                Last synced {relativeTime(mapping.lastSynced)}
              </span>
            )}
            {webUrl && <MappingLink label="Web" href={webUrl} />}
            {upstreamApi && (
              <MappingLink label="Upstream API" href={upstreamApi} />
            )}
          </li>
        );
      })}
    </ul>
  );
};
