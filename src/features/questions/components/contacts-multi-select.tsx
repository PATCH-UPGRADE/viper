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
import { cn } from "@/lib/utils";

type ContactOptions = { email: string; name?: string };

export function ContactMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: ContactOptions[];
  selected: string[];
  onChange: (emails: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (email: string) =>
    onChange(
      selected.includes(email)
        ? selected.filter((e) => e !== email)
        : [...selected, email],
    );

  return (
    <div className="flex w-full flex-col gap-1">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((email) => (
            <Badge
              key={email}
              variant="secondary"
              className="gap-1 pr-1 font-mono"
            >
              {email}
              <button
                type="button"
                onClick={() => toggle(email)}
                className="round-full p-0.5 hover:bg-muted/70"
                aria-label={`Remove ${email}`}
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
            disabled={false}
            className="h-8 justify-between font-normal"
          >
            <span className="text-muted-foreground">
              {selected.length === 0
                ? "Select contacts..."
                : `${selected.length} selected`}
            </span>
            <ChevronsUpDownIcon className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder="Search contacts..." />
            <CommandList>
              <CommandEmpty>No contacts found.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.email}
                    value={`${o.name ?? ""} ${o.email}`}
                    onSelect={() => toggle(o.email)}
                  >
                    <CheckIcon
                      className={cn(
                        "size-4",
                        selected.includes(o.email)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    {o.name ? `${o.name} - ${o.email}` : o.email}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
