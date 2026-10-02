"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export const useFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Esc exits on its own; the browser can also refuse (unsupported, or
  // blocked by an iframe policy), so never let the rejection escape.
  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast.error("Full screen isn't available in this browser");
    }
  }, []);

  return { isFullscreen, toggle };
};
