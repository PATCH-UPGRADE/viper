import { getSession } from "@/lib/auth-utils";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await getSession();
  if (!session)
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "Invalid or missing auth",
      },
      { status: 401 },
    );

  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
  const n8nKey = process.env.N8N_KEY;
  if (!n8nKey || !n8nWebhookUrl) {
    return NextResponse.json(
      {
        error: "Configuration error",
        message: "N8N integration not configured",
      },
      { status: 500 },
    );
  }

  let res: Response;
  try {
    res = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: { Authorization: n8nKey },
      signal: AbortSignal.timeout(30000), // 30s timeout
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Upstream error", message: "Failed to reach N8N webhook" },
      { status: 502 },
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: "Upstream error", message: `N8N returned ${res.status}` },
      { status: 502 },
    );
  }

  if (!res.body) {
    return NextResponse.json(
      { error: "Upstream error", message: "No response body from N8N" },
      { status: 502 },
    );
  }

  const { readable, writable } = new TransformStream();
  res.body.pipeTo(writable);

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
