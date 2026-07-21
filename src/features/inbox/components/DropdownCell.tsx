"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const UNKNOWN_VALUE = "Unknown";
const UNSURE_VALUE = "Not sure";

const DropdownCell = ({
  value,
  versionStatus,
  options,
  onAnswer,
  isPending,
}: {
  value: string | null;
  versionStatus: "UNKNOWN" | "UNSURE" | "KNOWN" | "NOT_APPLICABLE";
  options: string[];
  onAnswer: (
    answer: { version: string } | { versionStatus: "UNSURE" | "UNKNOWN" },
  ) => Promise<unknown>;
  isPending?: boolean;
}) => {
  const [selected, setSelected] = useState(
    versionStatus === "UNSURE" ? UNSURE_VALUE : (value ?? UNKNOWN_VALUE),
  );

  const handleDropDownValueChange = (newValue: string) => {
    if (newValue === selected) return;
    setSelected(newValue);
    if (newValue === UNSURE_VALUE) onAnswer({ versionStatus: "UNSURE" });
    else if (newValue === UNKNOWN_VALUE) onAnswer({ versionStatus: "UNKNOWN" });
    else onAnswer({ version: newValue });
  };

  const currentDisplayLabel =
    selected === UNKNOWN_VALUE
      ? "Unknown"
      : selected === UNSURE_VALUE
        ? "Not sure"
        : selected;

  return (
    <Select
      value={selected}
      disabled={isPending}
      onValueChange={(v) => handleDropDownValueChange(v)}
    >
      <SelectTrigger className="h-7 text-sm w-36">
        <SelectValue>{currentDisplayLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={UNKNOWN_VALUE} className="text-muted-foreground">
          Unknown
        </SelectItem>
        <SelectItem value={UNSURE_VALUE} className="text-muted-foreground">
          Not sure
        </SelectItem>
      </SelectContent>
    </Select>
  );
};

export default DropdownCell;
