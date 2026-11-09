"use client";

import { ExternalLinkIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ============================================================================
// SourceBlocks: a dashboard cell's sources as a row of initials
// ============================================================================

/**
 * One source of a row. `kind` sets the block's shape: integrations are squares, people are
 * circles, automations are filled circles. `typeLabel` is shown beside the name in the tooltip.
 */
export interface SourceBlock {
  key: string;
  name: string;
  kind: "integration" | "person" | "automation";
  typeLabel: string;
}

const BLOCK_CLASS: Record<SourceBlock["kind"] | "more", string> = {
  integration: "rounded-md bg-sidebar-accent text-foreground/80",
  person: "rounded-full bg-secondary text-secondary-foreground",
  automation:
    "rounded-full border-transparent bg-primary text-primary-foreground",
  more: "rounded-md bg-background text-muted-foreground",
};

/** Four blocks fit, so "+1" would save nothing. Past that, show three and a count. */
const SOURCE_BLOCK_LIMIT = 4;

export const initialsOf = (name: string) =>
  (name.trim() || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function Block({
  kind,
  children,
}: {
  kind: SourceBlock["kind"] | "more";
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center border text-[10px] font-semibold leading-none",
        BLOCK_CLASS[kind],
      )}
    >
      {children}
    </span>
  );
}

export function SourceBlocks({ blocks }: { blocks: SourceBlock[] }) {
  if (blocks.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const visible =
    blocks.length <= SOURCE_BLOCK_LIMIT
      ? blocks
      : blocks.slice(0, SOURCE_BLOCK_LIMIT - 1);
  const hiddenCount = blocks.length - visible.length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A button so keyboard users can focus it and get the tooltip. */}
        <button
          type="button"
          aria-label={`Sources: ${blocks.map((b) => b.name).join(", ")}`}
          className="inline-flex cursor-default items-center gap-[3px] rounded-md"
        >
          {visible.map((block) => (
            <Block key={block.key} kind={block.kind}>
              {initialsOf(block.name)}
            </Block>
          ))}
          {hiddenCount > 0 && <Block kind="more">+{hiddenCount}</Block>}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <ul className="flex min-w-48 flex-col gap-1">
          {blocks.map((block) => (
            <li
              key={block.key}
              className="flex items-baseline justify-between gap-4"
            >
              <span>{block.name}</span>
              <span className="whitespace-nowrap opacity-65">
                {block.typeLabel}
              </span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// SourceList: a drawer's compact list of where a record's data came from
// ============================================================================

export interface SourceListItem {
  key: string;
  icon: LucideIcon;
  name: string;
  /** A small tag after the name, e.g. "CSV" or "Feed". */
  tag?: string;
  meta: string;
  links: { label: string; href: string }[];
}

export function SourceList({
  items,
  emptyMessage,
}: {
  items: SourceListItem[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <ul className="flex w-full flex-col divide-y rounded-md border">
      {items.map(({ key, icon: Icon, name, tag, meta, links }) => (
        <li key={key} className="flex flex-col gap-0.5 px-3 py-2.5 text-sm">
          <div className="flex min-w-0 items-center gap-2 font-medium">
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="break-words">{name}</span>
            {tag && (
              <span className="rounded-md border px-1.5 text-xs font-medium">
                {tag}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{meta}</span>
            {links.map((link) => (
              <Tooltip key={link.href}>
                <TooltipTrigger asChild>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    {link.label}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>{link.href}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
