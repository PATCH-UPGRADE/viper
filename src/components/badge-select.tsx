"use client";

import type { ReactNode, Ref } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type BadgeSelectProps<T extends string> = {
  value: T;
  options: readonly T[];
  renderBadge: (value: T) => ReactNode;
  onPendingChanges: (next: T) => void;
  groupLabel?: string;
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
} & Omit<
  React.ComponentPropsWithoutRef<typeof SelectTrigger>,
  "size" | "children"
>;

export function BadgeSelect<T extends string>({
  value,
  options,
  renderBadge,
  onPendingChanges,
  groupLabel,
  disabled = false,
  className,
  ref,
  ...triggerProps
}: BadgeSelectProps<T>) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== value) {
          onPendingChanges(next as T);
        }
      }}
    >
      <SelectTrigger
        ref={ref}
        size="sm"
        className={cn(
          "h-auto w-fit gap-1 border-none bg-transparent px1 py-0.5 shadow-none hover:opacity-80 darl:bg-transparent",
          className,
        )}
        aria-label="Change value"
        {...triggerProps}
      >
        {renderBadge(value)}
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {" "}
          {groupLabel && (
            <SelectLabel className="text-muted-foreground">
              {groupLabel}
            </SelectLabel>
          )}
        </SelectGroup>

        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {renderBadge(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
