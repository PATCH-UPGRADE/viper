"use client";

import { formatDistanceToNow } from "date-fns";
import { ChevronDownIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { cn, firstNameOf } from "@/lib/utils";
import { useRegenerateDebrief, useSuspenseDebrief } from "../hooks/use-debrief";
import { DebriefBulletText } from "./debrief-bullet";

type Debrief = NonNullable<ReturnType<typeof useSuspenseDebrief>["data"]>;

const BulletDot = () => (
  <span
    aria-hidden="true"
    className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-primary"
  />
);

/** Skeleton rows while a run is in flight, so the card keeps its height. */
const PendingBody = () => (
  <div className="flex flex-col gap-3 px-5 py-4" aria-live="polite">
    <span className="sr-only">Generating your debrief…</span>
    {[0, 1, 2].map((row) => (
      <div key={row} className="flex gap-3">
        <Skeleton className="mt-[0.45rem] size-1.5 shrink-0 rounded-full" />
        <Skeleton className={cn("h-4", row === 2 ? "w-2/3" : "w-full")} />
      </div>
    ))}
  </div>
);

const FailedBody = ({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) => (
  <div className="flex flex-col items-start gap-3 px-5 py-4">
    <p className="text-sm text-muted-foreground">
      This debrief could not be generated. Your previous brief is unchanged.
    </p>
    <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
      Try again
    </Button>
  </div>
);

const ReadyBody = ({ bullets }: { bullets: Debrief["bullets"] }) => (
  <ul className="flex flex-col gap-3 px-5 py-4">
    {bullets.map((bullet, index) => (
      // Index is a safe key here: bullets have no id of their own, and the
      // whole list is replaced on every refetch rather than reordered.
      <li key={index} className="flex gap-3 text-sm leading-relaxed">
        <BulletDot />
        <span>
          <DebriefBulletText bullet={bullet} />
        </span>
      </li>
    ))}
  </ul>
);

/**
 * The daily AI brief for the reader's department.
 *
 * An empty shell tells the reader less than no card at all.
 */
export const DebriefCard = () => {
  const { data } = useSuspenseDebrief();
  const { data: session } = authClient.useSession();
  const regenerate = useRegenerateDebrief();
  const [open, setOpen] = useState(true);
  const panelId = useId();

  if (!data) return null;

  const pending = data.pending || regenerate.isPending;
  const hasBrief = data.bullets.length > 0;

  return (
    <Card className="gap-0 py-0 shadow-none">
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <SparklesIcon className="size-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold leading-none">
                Your VIPER Debrief
              </h2>
              <Badge variant="secondary" className="text-primary">
                AI
              </Badge>
            </div>
            <p
              className="text-sm text-muted-foreground"
              suppressHydrationWarning
            >
              {[
                `Personalized brief for ${firstNameOf(session?.user.name) ?? data.department.name}`,
                data.generatedAt
                  ? `generated ${formatDistanceToNow(data.generatedAt, { addSuffix: true })}`
                  : null,
                pending ? "refreshing…" : null,
                !pending && data.lastRunFailed && hasBrief
                  ? "last refresh failed"
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => regenerate.mutate()}
            disabled={pending}
            aria-label="Regenerate debrief"
          >
            <RefreshCwIcon
              className={cn("size-4", pending && "animate-spin")}
              aria-hidden="true"
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? "Collapse debrief" : "Expand debrief"}
          >
            <ChevronDownIcon
              className={cn(
                "size-4 transition-transform",
                !open && "-rotate-90",
              )}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>

      {open && (
        <div id={panelId} className="border-t">
          {hasBrief ? (
            // Keep the last good brief on screen while a new run works. A
            // reader who presses Regenerate should not lose today's answer.
            <ReadyBody bullets={data.bullets} />
          ) : pending ? (
            <PendingBody />
          ) : (
            <FailedBody
              onRetry={() => regenerate.mutate()}
              retrying={regenerate.isPending}
            />
          )}

          <p className="flex items-center gap-1.5 border-t px-5 py-3 text-xs text-muted-foreground">
            <SparklesIcon className="size-3" aria-hidden="true" />
            Generated by VIPER AI · may contain mistakes.
          </p>
        </div>
      )}
    </Card>
  );
};
