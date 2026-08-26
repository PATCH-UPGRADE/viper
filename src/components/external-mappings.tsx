"use client";

import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { UrlBearingMapping } from "@/features/integrations/core/urls";

/**
 * The common shape of every `External*Mapping` select in the app.
 */
export interface ExternalMappingLike extends UrlBearingMapping {
  externalId: string;
  integration: { id: string; name: string };
  lastSynced?: Date | null;
}

const MappingLink = ({ label, href }: { label: string; href: string }) => (
  <div>
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
  </div>
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

        return (
          <li
            key={`${mapping.integration.id}:${mapping.externalId}`}
            className="text-sm flex flex-col gap-1"
          >
            <span className="font-medium">{mapping.integration.name}</span>
            {mapping.lastSynced && (
              <span className="text-xs text-muted-foreground">
                Last synced{" "}
                {formatDistanceToNow(mapping.lastSynced, { addSuffix: true })}
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
