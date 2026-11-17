"use client";

import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
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
import {
  getAssetDeviceTypeLabel,
  getAssetIdentifier,
} from "@/features/assets/utils";
import { useAttachableAssets } from "../../hooks/use-tracking";

export type AttachableAsset = NonNullable<
  ReturnType<typeof useAttachableAssets>["data"]
>[number];

export const describeAttachableAsset = (asset: AttachableAsset) => {
  const model = [
    asset.manufacturer?.canonicalDisplayName,
    asset.product?.canonicalDisplayName,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    label: getAssetIdentifier(asset),
    sub: [getAssetDeviceTypeLabel(asset), model].filter(Boolean).join(" · "),
  };
};

const SEARCH_DEBOUNCE_MS = 500;

/**
 * Searches the assets a ticket can link. With a `ticketId` the server leaves
 * out the assets the ticket already has. Without one, every asset is offered,
 * and `excludeIds` hides the ones the caller holds locally.
 */
export const AssetPickerPopover = ({
  ticketId,
  excludeIds,
  onSelect,
  pending = false,
}: {
  ticketId?: string;
  excludeIds?: string[];
  /** `close` dismisses the popover. A caller that waits on a request calls it on success. */
  onSelect: (asset: AttachableAsset, close: () => void) => void;
  pending?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  // The hundred-row query waits for the first open, not for the mount.
  const { data: candidates } = useAttachableAssets(ticketId, searchQuery, open);

  useEffect(() => {
    const timer = setTimeout(
      () => setSearchQuery(searchInput),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  const excluded = new Set(excludeIds ?? []);
  const close = () => setOpen(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" type="button">
          <PlusIcon className="size-3.5" />
          Add asset
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-96" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search assets..."
            value={searchInput}
            onValueChange={setSearchInput}
          />
          <CommandList>
            <CommandEmpty>No eligible assets found.</CommandEmpty>
            <CommandGroup>
              {(candidates ?? [])
                .filter((a) => !excluded.has(a.id))
                .map((a) => {
                  const { label, sub } = describeAttachableAsset(a);
                  return (
                    <CommandItem
                      key={a.id}
                      value={a.id}
                      onSelect={() => onSelect(a, close)}
                      disabled={pending}
                    >
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="truncate font-medium">{label}</span>
                        {sub && (
                          <span className="text-xs text-muted-foreground truncate">
                            {sub}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
