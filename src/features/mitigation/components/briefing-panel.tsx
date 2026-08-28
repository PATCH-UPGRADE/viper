"use client";

import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  Loader2Icon,
  PencilIcon,
  SparklesIcon,
} from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MarkdownWithTablesWrapper } from "@/components/ui/markdown-with-tables-wrapper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { handleCopy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { useBriefing, useUpdateBriefing } from "../hooks/use-mitigation";
import {
  buildBriefingPdf,
  downloadBlob,
  parseSections,
  toPlainText,
} from "./briefing-export";

// Labels/sub-labels match the reference mock's AudienceSwitch exactly.
const AUDIENCES = [
  { value: "ciso", label: "CISO", sub: "Security leadership" },
  { value: "cmio", label: "CMIO", sub: "Clinical leadership" },
  { value: "deptHead", label: "Dept. head", sub: "Service-line owner" },
] as const;

type Audience = (typeof AUDIENCES)[number]["value"];
type Feedback = "copy" | "pdf";

const successBtnClass =
  "border-green-600 bg-green-50 text-green-600 hover:bg-green-50 dark:bg-green-950/40";

export function BriefingPanel({
  planId,
  title = "Briefing",
}: {
  planId: string;
  title?: string;
}) {
  const { data, isLoading, isError, isRefetching, refetch } =
    useBriefing(planId);
  const updateBriefing = useUpdateBriefing(planId);
  const [audience, setAudience] = useState<Audience>("ciso");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const header = (
    <CardHeader className="gap-1 px-5">
      <CardTitle className="flex items-center gap-2 text-sm font-bold">
        <SparklesIcon className="size-4 text-primary" />
        Make the case for this plan
      </CardTitle>
      <CardDescription className="text-xs">
        Drafted by Viper from this plan and the evidence behind it · review
        before sending.
      </CardDescription>
    </CardHeader>
  );

  if (isLoading) {
    return (
      <Card className="gap-4 py-5">
        {header}
        <CardContent className="flex flex-col items-center gap-2 px-5 py-10 text-sm text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" />
          Generating briefing...
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="gap-4 py-5">
        {header}
        <CardContent className="flex flex-col items-center gap-3 px-5 py-10 text-sm text-muted-foreground">
          <p>Couldn&apos;t load the briefing.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            {isRefetching ? "Retrying..." : "Retry"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const audienceLabel =
    AUDIENCES.find((a) => a.value === audience)?.label ?? audience;
  const content = data[audience];

  const startEdit = () => {
    setDraft(content);
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    // Trim before sending so the cache patch below (via mutation variables)
    // matches exactly what the server persists (it also trims).
    updateBriefing.mutate(
      { planId, audience, content: draft.trim() },
      { onSuccess: () => setEditing(false) },
    );
  };

  const flashFeedback = (kind: Feedback) => {
    setFeedback(kind);
    setTimeout(() => setFeedback(null), 1800);
  };

  const copyContent = () => {
    handleCopy(toPlainText(content), () => flashFeedback("copy"));
  };

  const exportPdf = async () => {
    const blob = await buildBriefingPdf(
      `${title} — briefing for ${audienceLabel}`,
      content,
    );
    const fileBase = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadBlob(blob, `${fileBase}-briefing-${audience}.pdf`);
    flashFeedback("pdf");
  };

  const actions = [
    {
      key: null,
      icon: PencilIcon,
      onClick: startEdit,
      label: "Edit this briefing",
      doneLabel: "",
    },
    {
      key: "copy",
      icon: CopyIcon,
      onClick: copyContent,
      label: "Copy as text",
      doneLabel: "Copied!",
    },
    {
      key: "pdf",
      icon: DownloadIcon,
      onClick: exportPdf,
      label: "Download as PDF",
      doneLabel: "Downloaded!",
    },
  ] as const;

  return (
    <Card className="gap-4 py-5">
      {header}
      <CardContent className="px-5">
        <Tabs
          value={audience}
          onValueChange={(v) => setAudience(v as Audience)}
        >
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Written for
          </p>
          {/* TabsList/TabsTrigger (not raw buttons) so the switch keeps
              tab semantics and keyboard nav — styled to the pill/two-line
              look instead of the app's default Tabs chrome. */}
          <TabsList
            className={cn(
              "h-auto w-full gap-1 rounded-[9px] bg-muted p-[3px]",
              editing && "pointer-events-none opacity-55",
            )}
          >
            {AUDIENCES.map((a) => (
              <TabsTrigger
                key={a.value}
                value={a.value}
                title={a.sub}
                className="group h-auto flex-col gap-0 rounded-[7px] border-none px-2 py-1.5 shadow-none data-[state=active]:bg-background data-[state=active]:shadow-[0_1px_3px_rgba(16,24,40,0.12)] data-[state=inactive]:text-muted-foreground"
              >
                <span className="text-[12.5px] font-semibold leading-tight group-data-[state=active]:font-bold group-data-[state=active]:text-foreground">
                  {a.label}
                </span>
                <span className="mt-0.5 text-[10.5px] leading-tight text-muted-foreground/80">
                  {a.sub}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent
            value={audience}
            className="flex flex-col gap-[13px] pt-[13px]"
          >
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <Button variant="outline" size="sm" onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveEdit}
                    disabled={
                      updateBriefing.isPending || draft.trim().length === 0
                    }
                  >
                    <CheckIcon className="size-3.5" strokeWidth={2.1} />
                    Save
                  </Button>
                </>
              ) : (
                actions.map((action) => {
                  const done = action.key !== null && feedback === action.key;
                  const Icon = done ? CheckIcon : action.icon;
                  return (
                    <Tooltip key={action.label}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={action.onClick}
                          className={cn(done && successBtnClass)}
                        >
                          <Icon className="size-[15px]" strokeWidth={1.9} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {done ? action.doneLabel : action.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })
              )}
            </div>

            {editing ? (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={16}
                className="min-h-[280px] resize-y rounded-[9px] border-primary px-3.5 py-3 text-[12.5px] leading-[1.7]"
              />
            ) : (
              <BriefingContent content={content} />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Renders each "Heading / body" section with a leading bullet, matching the
// reference mock. Falls back to plain markdown for content that no longer
// matches the shape (e.g. after a manual edit).
function BriefingContent({ content }: { content: string }) {
  const sections = parseSections(content);
  if (sections.some((section) => !section.header)) {
    return (
      <div className="text-sm">
        <MarkdownWithTablesWrapper>{content}</MarkdownWithTablesWrapper>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      {sections.map((section) => (
        <div key={section.header} className="flex gap-2.5">
          <span className="mt-[7px] size-1.5 shrink-0 rounded-[2px] bg-primary" />
          <div>
            <p className="font-bold text-foreground">{section.header}</p>
            {/* Body is a single sentence or two, not a document — render
                inline (not through MarkdownWithTablesWrapper's block/table
                styling) so stray emphasis in the model's prose still shows
                as italics instead of literal asterisks. */}
            <p className="mt-0.5 leading-relaxed text-muted-foreground">
              <Markdown remarkPlugins={[remarkGfm]} components={{ p: "span" }}>
                {section.body}
              </Markdown>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
