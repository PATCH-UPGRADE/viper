"use client";

import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getChipClass } from "@/features/tag-colors/palette";
import { cn } from "@/lib/utils";

type DepartmentOption = { id: string; name: string; color: string | null };

export const DepartmentMultiSelect = ({
  options,
  selectedIds,
  onChange,
}: {
  options: DepartmentOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => selectedIds.includes(o.id));

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id],
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((d) => (
            <Badge
              key={d.id}
              variant="outline"
              className={cn(getChipClass(d.color), "gap-1 pr-1")}
            >
              {d.name}
              <button
                type="button"
                onClick={() => toggle(d.id)}
                className="rounded-full hover:bg-muted/70 p-0.5"
                aria-label={`Remove ${d.name}`}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="justify-between font-normal"
          >
            <span className="text-muted-foreground">
              {selected.length === 0
                ? "Select departments..."
                : `${selected.length} selected`}
            </span>
            <ChevronsUpDownIcon className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
          <Command>
            <CommandInput placeholder="Search departments..." />
            <CommandList>
              <CommandEmpty>No departments found.</CommandEmpty>
              <CommandGroup>
                {options.map((d) => {
                  const isSelected = selectedIds.includes(d.id);
                  return (
                    <CommandItem
                      key={d.id}
                      value={d.name}
                      onSelect={() => toggle(d.id)}
                    >
                      <CheckIcon
                        className={cn(
                          "size-4",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {d.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
