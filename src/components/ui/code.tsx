"use client";

import { CopyIcon } from "lucide-react";
import type * as React from "react";
import { handleCopy, useFlash } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const Copy = ({ content }: { content: string }) => {
  const [copied, flash] = useFlash();

  return (
    <Tooltip>
      <TooltipTrigger onClick={() => handleCopy(content, flash)}>
        <CopyIcon className="stroke-blue-500" size={16} />
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied!" : "Copy"}</TooltipContent>
    </Tooltip>
  );
};

function CopyCode({ className, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      data-slot="card"
      className={cn(
        "w-full text-xs bg-muted px-2 py-1 rounded",
        "flex justify-between items-center",
        className,
      )}
      {...props}
    >
      <div className="overflow-auto">{props.children}</div>
      <Copy
        content={
          typeof props.children === "string"
            ? props.children
            : String(props.children ?? "")
        }
      />
    </code>
  );
}

export { CopyCode };
