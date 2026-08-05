"use client";

import { ArrowRightIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OverviewCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
};

export const OverviewCard = ({
  icon: Icon,
  title,
  description,
  action,
  children,
}: OverviewCardProps) => (
  <Card className="gap-0 py-0 shadow-none">
    <div className="flex items-start justify-between gap-4 p-5">
      <div className="flex items-start gap-3 min-w-0">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="text-base font-semibold leading-none">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {action && (
        <Button variant="outline" size="sm" asChild>
          <Link href={action.href} prefetch>
            {action.label}
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      )}
    </div>
    <div className="flex flex-col divide-y border-t">{children}</div>
  </Card>
);

export const OverviewCardRow = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => (
  <Link
    href={href}
    prefetch
    className="flex flex-col gap-1.5 px-5 py-4 transition-colors hover:bg-accent/50"
  >
    {children}
  </Link>
);

export const OverviewCardMeta = ({
  parts,
  className,
}: {
  parts: (string | null)[];
  className?: string;
}) => {
  const visible = parts.filter((part): part is string => Boolean(part));
  if (visible.length === 0) return null;

  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {visible.join(" · ")}
    </p>
  );
};

export const OverviewCardEmpty = ({ message }: { message: string }) => (
  <p className="px-5 py-6 text-sm text-muted-foreground">{message}</p>
);
