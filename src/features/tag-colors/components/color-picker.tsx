"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  formatHueLabel,
  getSwatchClass,
  type TagHue,
  TAG_PALETTE,
} from "../palette";

interface ColorPickerProps {
  value: string | null | undefined;
  onChange: (hue: TagHue) => void;
  disabled?: boolean;
}

export const ColorPicker = ({
  value,
  onChange,
  disabled,
}: ColorPickerProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="justify-between min-w-32"
        >
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block size-3.5 rounded-full",
                getSwatchClass(value),
              )}
            />
            <span>{formatHueLabel(value)}</span>
          </span>
          <ChevronDownIcon className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="grid grid-cols-5 gap-1">
          {TAG_PALETTE.map((hue) => {
            const isActive = value === hue;
            return (
              <button
                key={hue}
                type="button"
                onClick={() => onChange(hue)}
                title={formatHueLabel(hue)}
                className={cn(
                  "relative aspect-square rounded-md border border-transparent flex items-center justify-center hover:border-foreground/30 transition",
                  isActive && "ring-2 ring-foreground/40",
                )}
              >
                <span
                  className={cn("size-6 rounded-md", getSwatchClass(hue))}
                />
                {isActive && (
                  <CheckIcon className="absolute size-4 text-white drop-shadow" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
