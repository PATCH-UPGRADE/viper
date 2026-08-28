import { useState } from "react";

export const handleCopy = async (content: string, onSuccess?: () => void) => {
  if ("clipboard" in navigator) {
    await navigator.clipboard.writeText(content);
    if (onSuccess) {
      onSuccess();
    }
  } else {
    // for older browsers
    document.execCommand("copy", true, content);
    if (onSuccess) {
      onSuccess();
    }
  }
};

// `active` flips true for `duration`ms after `flash()` — the "Copied!"
// tooltip/icon swap shared by CopyCode and BriefingPanel's action row.
export function useFlash(duration = 2000) {
  const [active, setActive] = useState(false);
  const flash = () => {
    setActive(true);
    setTimeout(() => setActive(false), duration);
  };
  return [active, flash] as const;
}
