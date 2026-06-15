// THROWAWAY Vercel streaming diagnostic (unauthenticated, no DB).
// Deploy, then: curl -N https://<your-app>/api/stream-test
// Chunks 300ms apart = Vercel streams fine. All at once at the end = Vercel
// is buffering the response. DELETE once streaming is confirmed working.
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: "t" });
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 300));
        writer.write({ type: "text-delta", id: "t", delta: `chunk-${i} ` });
      }
      writer.write({ type: "text-end", id: "t" });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
