"use client";

import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
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
import { cn } from "@/lib/utils";

export type CommandMultiSelectProps<T> = {
  options: T[];
  /** Selected keys. May include keys not present in `options`. */
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Stable identity for an option, used as the selection key. */
  getKey: (option: T) => string;
  /** String the command palette filters against. */
  getSearchValue: (option: T) => string;
  /** Content for an option row in the dropdown. */
  renderOption: (option: T) => ReactNode;
  /**
   * Text label for a selected chip (also used as the remove button's
   * accessible name). Receives the resolved option when the selected key
   * matches one of `options`, otherwise only the raw key.
   */
  getChipLabel: (option: T | undefined, key: string) => string;
  chipVariant?: React.ComponentProps<typeof Badge>["variant"];
  getChipClassName?: (option: T | undefined, key: string) => string | undefined;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  containerClassName?: string;
  triggerClassName?: string;
} & React.AriaAttributes;

export function CommandMultiSelect<T>({
  options,
  selected,
  onChange,
  getKey,
  getSearchValue,
  renderOption,
  getChipLabel,
  chipVariant = "secondary",
  getChipClassName,
  placeholder,
  searchPlaceholder,
  emptyText,
  containerClassName,
  triggerClassName,
  ...aria
}: CommandMultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const byKey = new Map(options.map((o) => [getKey(o), o] as const));

  const toggle = (key: string) =>
    onChange(
      selected.includes(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key],
    );

  return (
    <div className={cn("flex flex-col gap-2", containerClassName)}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((key) => {
            const option = byKey.get(key);
            const label = getChipLabel(option, key);
            return (
              <Badge
                key={key}
                variant={chipVariant}
                className={cn("gap-1 pr-1", getChipClassName?.(option, key))}
              >
                {label}
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="rounded-full p-0.5 hover:bg-muted/70"
                  aria-label={`Remove ${label}`}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("justify-between font-normal", triggerClassName)}
            {...aria}
          >
            <span className="text-muted-foreground">
              {selected.length === 0
                ? placeholder
                : `${selected.length} selected`}
            </span>
            <ChevronsUpDownIcon className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const key = getKey(option);
                  return (
                    <CommandItem
                      key={key}
                      value={getSearchValue(option)}
                      onSelect={() => toggle(key)}
                    >
                      <CheckIcon
                        className={cn(
                          "size-4",
                          selected.includes(key) ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {renderOption(option)}
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
}
