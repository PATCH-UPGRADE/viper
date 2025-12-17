import { toast } from "sonner";

export const handleCopy = async (content: string) => {
  if ("clipboard" in navigator) {
    await navigator.clipboard.writeText(content);
    toast.success("Copied!");
  } else {
    // for older browsers
    document.execCommand("copy", true, content);
  }
};
