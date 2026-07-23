/**
 * THROWAWAY streaming isolation probe. Delete once the streaming bug is fixed.
 *
 * Unauthenticated. Emits one SSE chunk every 300ms for 15s, using the SAME
 * headers the AI SDK's chat route uses. Deploy, then:
 *
 *   curl -N https://<deployment>.vercel.app/api/stream-test
 *
 * - Lines print one-per-300ms  -> Vercel IS streaming; the bug is in the chat
 *   route's own timing (something delays the first real token).
 * - Nothing prints for ~15s then all lines dump at once -> Vercel/runtime is
 *   buffering the whole response; the fix is platform-level, not app code.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < 15; i++) {
        const ts = i * 300;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ i, ts })}\n\n`),
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
