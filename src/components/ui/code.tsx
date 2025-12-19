"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { CopyIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { handleCopy } from "@/lib/copy";

const Copy = ({ content }: { content: string }) => {
  const [copied, setCopied] = React.useState(false);
  const handleCopyOuter = async () => {
    await handleCopy(content, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger onClick={handleCopyOuter}>
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
