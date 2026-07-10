"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const handleOnClickPlayWright = async () => {
  toast.info("Testing playwright");
  try {
    const res = await fetch("/api/test-playwright");
    const data = await res.json();
    console.log("test playwright result ", data);
    if (data.ok) {
      toast.success(`Success: Cookie length: ${data.cookieLength}`);
    } else {
      toast.error(`Failed: ${data.error} `);
    }
  } catch (err) {
    console.error(err);
    toast.error("Request failed entirely");
  }
};

export function TestPlaywrightButton() {
  return (
    <Button variant="outline" onClick={handleOnClickPlayWright}>
      Test Playwright
    </Button>
  );
}
