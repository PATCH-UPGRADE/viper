import { Badge } from "@/components/ui/badge";
import type { Tlp } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// TLP badge — colors per https://www.first.org/tlp/
// ---------------------------------------------------------------------------

export const tlpConfig: Record<Tlp, { label: string; bg: string }> = {
  RED: { label: "TLP:RED", bg: "#FF2B2B" },
  AMBER: { label: "TLP:AMBER", bg: "#FFC000" },
  AMBER_STRICT: { label: "TLP:AMBER+STRICT", bg: "#FFC000" },
  GREEN: { label: "TLP:GREEN", bg: "#33FF00" },
  CLEAR: { label: "TLP:CLEAR", bg: "#FFFFFF" },
  WHITE: { label: "TLP:WHITE", bg: "#FFFFFF" },
};

export const TlpBadge = ({ tlp, source }: { tlp: Tlp; source: string }) => {
  const config = tlpConfig[tlp];
  const isClear = tlp === "CLEAR" || tlp === "WHITE";
  return (
    <Badge
      asChild
      variant="outline"
      className={`gap-0 p-0 ${isClear ? "border-gray-300" : ""}`}
    >
      <div style={{ borderColor: isClear ? undefined : config.bg }}>
        <div className="max-w-48 truncate px-2 py-0.5 text-foreground">
          {source}
        </div>
        <div
          className="px-2 py-0.5"
          style={{ backgroundColor: config.bg, color: "#000000" }}
        >
          {config.label}
        </div>
      </div>
    </Badge>
  );
};
