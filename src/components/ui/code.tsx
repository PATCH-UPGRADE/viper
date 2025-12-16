import * as React from "react";

import { cn } from "@/lib/utils";
import { CopyIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const Copy = ({ content }: { content: string }) => {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = async () => {
    if (!content) {
      return;
    }

    if ("clipboard" in navigator) {
      await navigator.clipboard.writeText(content);
    } else {
      // for older browsers
      document.execCommand("copy", true, content);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tooltip>
      <TooltipTrigger onClick={handleCopy}>
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
      <Copy content={props.children as string} />
    </code>
  );
}

export { CopyCode };
