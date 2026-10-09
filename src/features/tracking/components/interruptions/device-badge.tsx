import { Badge } from "@/components/ui/badge";
import { iconFor } from "@/lib/icon-map";
import { plural } from "@/lib/utils";

// How many devices an event covers, e.g. a monitor icon and "2".
export const DeviceBadge = ({
  count,
  icon,
}: {
  count: number;
  icon?: string | null;
}) => {
  const Icon = iconFor(icon);
  return (
    <Badge
      variant="outline"
      className="bg-transparent px-1 text-[11px]"
      role="img"
      aria-label={`${count} ${plural("device", count)}`}
    >
      <Icon className="size-3" aria-hidden />
      {count}
    </Badge>
  );
};
