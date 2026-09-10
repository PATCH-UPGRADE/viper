"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/string-utils";
import { seenBySummary } from "@/lib/utils";

export type Viewer = { id: string; name: string | null; image: string | null };

const MAX_NAMED_VIEWERS = 3;

export const SeenBy = ({ viewers }: { viewers: Viewer[] }) => {
  const namedViewers = viewers.slice(0, MAX_NAMED_VIEWERS);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {namedViewers.length > 0 && (
        <div className="-space-x-2 flex">
          {namedViewers.map((viewer) => (
            <Avatar key={viewer.id} className="size-6 border">
              {viewer.image && (
                <AvatarImage src={viewer.image} alt={viewer.name ?? ""} />
              )}
              <AvatarFallback className="bg-accent text-[10px] text-accent-foreground">
                {initialsOf(viewer.name)}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
      )}
      <span>{seenBySummary(viewers, MAX_NAMED_VIEWERS)}</span>
    </div>
  );
};
