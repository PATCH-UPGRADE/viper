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
