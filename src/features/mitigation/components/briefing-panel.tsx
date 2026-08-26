"use client";

import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownWithTablesWrapper } from "@/components/ui/markdown-with-tables-wrapper";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBriefing } from "../hooks/use-mitigation";

const AUDIENCES = [
  { value: "ciso", label: "CISO" },
  { value: "cmio", label: "CMIO" },
  { value: "deptHead", label: "Dept Head" },
] as const;

type Audience = (typeof AUDIENCES)[number]["value"];

export function BriefingPanel({ planId }: { planId: string }) {
  const { data, isLoading, isError, isRefetching, refetch } =
    useBriefing(planId);
  const [audience, setAudience] = useState<Audience>("ciso");

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        Generating briefing...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
        <p>Couldn&apos;t load the briefing.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          {isRefetching ? "Retrying..." : "Retry"}
        </Button>
      </div>
    );
  }

  return (
    <Tabs value={audience} onValueChange={(v) => setAudience(v as Audience)}>
      <TabsList>
        {AUDIENCES.map((a) => (
          <TabsTrigger key={a.value} value={a.value}>
            {a.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="pt-4 text-sm">
        <MarkdownWithTablesWrapper>{data[audience]}</MarkdownWithTablesWrapper>
      </div>
    </Tabs>
  );
}
