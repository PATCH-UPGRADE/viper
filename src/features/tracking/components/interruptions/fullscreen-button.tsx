"use client";

import { MaximizeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const FullscreenButton = () => (
  <Button
    variant="ghost"
    size="icon"
    aria-label="Full screen"
    onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
  >
    <MaximizeIcon aria-hidden />
  </Button>
);
