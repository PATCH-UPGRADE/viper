/**
 * THROWAWAY streaming isolation probe. Delete once the streaming bug is fixed.
 *
 * Unauthenticated. Fires a large priming chunk immediately, then one padded
 * chunk every 300ms for ~15s. The padding defeats byte-threshold buffers
 * (WebKit's 1KB, edge-compression windows) so a "dump at once" result can only
 * mean the platform is genuinely buffering the whole response.
 *
 *   curl -N -i https://<deployment>.vercel.app/api/stream-test
 *
 * -i also prints response headers — check for `content-encoding` (edge
 * compression) and `transfer-encoding: chunked`.
 *
 * - Priming chunk appears instantly, then a line every ~300ms -> Vercel streams;
 *   the original tiny probe just never crossed a flush threshold.
 * - ~15s of silence, then everything at once -> platform/runtime buffers the
 *   whole response even at ~60KB. Fix is at the Vercel/Sentry layer.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ~4KB of padding per line as an SSE comment (`:` prefixed lines are ignored by
// SSE parsers but still count as bytes on the wire).
const PAD = ":".padEnd(4096, " ");

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Prime: ~8KB up front to blow past any first-byte buffer immediately.
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
