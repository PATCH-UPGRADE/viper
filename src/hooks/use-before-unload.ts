import { useEffect } from "react";

/**
 * Register a browser-level "are you sure you want to leave" prompt while
 * `when` is true. Fires on tab close, browser close, and hard refresh.
 *
 * Note: modern browsers display a generic message regardless of what we set
 * on `returnValue` — the prompt itself is the contract, not the text.
 *
 * For in-app navigation (e.g. clicking a Next.js Link), guard at the
 * component level with an explicit `window.confirm` on the action that
 * would discard state.
 */
export function useBeforeUnload(when: boolean) {
  useEffect(() => {
    if (!when) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers require setting returnValue to trigger the prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);
}
