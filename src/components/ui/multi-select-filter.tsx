"use client";

import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function MultiSelectFilter<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 bg-background">
          {label}
          {value.length > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5">
              {value.length}
            </Badge>
          )}
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="end">
        {options.map((opt) => (
          <div
            key={opt.value}
            role="menuitemcheckbox"
            aria-checked={value.includes(opt.value)}
            tabIndex={0}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
            onClick={() => {
              const next = value.includes(opt.value)
                ? value.filter((v) => v !== opt.value)
                : [...value, opt.value];
              onChange(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const next = value.includes(opt.value)
                  ? value.filter((v) => v !== opt.value)
                  : [...value, opt.value];
                onChange(next);
              }
            }}
          >
            <Checkbox checked={value.includes(opt.value)} tabIndex={-1} />
            {opt.label}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
