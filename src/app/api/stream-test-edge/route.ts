/**
 * THROWAWAY streaming isolation probe — EDGE runtime twin of /api/stream-test.
 * Identical body; only the runtime differs. Deploy both, curl both:
 *
 *   curl -N -sS https://<deployment>.vercel.app/api/stream-test-edge \
 *     | grep --line-buffered '^data:' \
 *     | while IFS= read -r l; do echo "$(date +%T.%N) $l"; done
 *
 * - Edge trickles ~300ms apart but node buffers -> Vercel's NODE serverless
 *   runtime is the buffer; run streaming routes on edge (or fix node config).
 * - Edge ALSO buffers -> the buffer is above the function (project/CDN setting).
 */
export const runtime = "edge";
export const dynamic = "force-dynamic";

const PAD = ":".padEnd(4096, " ");

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`${PAD}\n${PAD}\n\n`));

      for (let i = 0; i < 15; i++) {
        controller.enqueue(
          encoder.encode(`${PAD}\ndata: ${JSON.stringify({ i })}\n\n`),
        );
        await new Promise((r) => setTimeout(r, 300));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
