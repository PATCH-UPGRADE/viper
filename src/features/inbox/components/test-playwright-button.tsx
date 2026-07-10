"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const handleOnClickPlayWright = async () => {
  toast.info("Testing playwright");
  try {
    const res = await fetch("/api/test-playwright");
    const data = await res.json();
    const text = await res.text();
    console.log("status ", res.status);
    console.log("raw body ", text);
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
