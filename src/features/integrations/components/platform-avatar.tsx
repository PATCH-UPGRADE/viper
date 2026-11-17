import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/string-utils";
import { cn } from "@/lib/utils";

/** The square initials tile that stands in for a platform or integration logo. */
export const PlatformAvatar = ({
  name,
  className,
}: {
  name: string;
  /** Sizing, e.g. `size-8`. Defaults to `size-9`. */
  className?: string;
}) => (
  <Avatar className={cn("size-9 shrink-0 rounded-md border", className)}>
    <AvatarFallback className="rounded-md bg-accent text-accent-foreground text-xs font-semibold">
      {initialsOf(name)}
    </AvatarFallback>
  </Avatar>
);
