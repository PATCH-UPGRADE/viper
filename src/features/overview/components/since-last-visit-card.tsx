"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/**
 * Placeholder for the "Since you last visited" summary.
 */
export const SinceLastVisitCard = () => (
  <Card className="gap-0 py-0 shadow-none">
    <div className="flex items-start justify-between gap-4 p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold leading-none">
          Since you last visited
        </h2>
        <p className="text-sm text-muted-foreground">
          A summary of what changed while you were away
        </p>
      </div>
      <Badge className="shrink-0 bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
        New
      </Badge>
    </div>
  </Card>
);
