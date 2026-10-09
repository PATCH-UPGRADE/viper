"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MAX_NAME_SEARCH_RESULTS, type NameRef } from "../contract";
import { useSearchNames } from "../hooks/use-csv-import";

const SEARCH_DELAY_MS = 250;

export const NamePicker = ({
  kind,
  manufacturerId,
  pressed,
  disabled = false,
  onPick,
}: {
  kind: "manufacturer" | "product";
  manufacturerId?: string;
  pressed: boolean;
  disabled?: boolean;
  onPick: (picked: NameRef) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    const timer = setTimeout(
      () => setSearchText(typedText.trim()),
      SEARCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [typedText]);

  const { data: existingNames = [], isLoading } = useSearchNames(
    { kind, query: searchText, manufacturerId },
    open,
  );
  const listIsCutShort = existingNames.length === MAX_NAME_SEARCH_RESULTS;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={pressed ? "secondary" : "outline"}
          size="sm"
          aria-pressed={pressed}
          disabled={disabled}
        >
          <SearchIcon />
          Pick existing
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={typedText}
            onValueChange={setTypedText}
            placeholder={
              kind === "manufacturer"
                ? "Search manufacturers"
                : "Search products"
            }
          />
          <CommandList>
            <CommandEmpty>{isLoading ? "Loading…" : "No matches"}</CommandEmpty>
            {existingNames.map((existingName) => (
              <CommandItem
                key={existingName.id}
                value={existingName.id}
                onSelect={() => {
                  onPick(existingName);
                  setOpen(false);
                }}
              >
                {existingName.displayName}
              </CommandItem>
            ))}
          </CommandList>
          {listIsCutShort && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Showing the first {MAX_NAME_SEARCH_RESULTS}. Type to find others.
            </p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};
