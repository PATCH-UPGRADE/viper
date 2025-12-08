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
    throw new Error("Missing required env vars");
  }

  const res = await fetch(n8nWebhookUrl, {
    method: "POST",
    headers: { Authorization: n8nKey },
  });

  const { readable, writable } = new TransformStream();
  res.body?.pipeTo(writable);

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
