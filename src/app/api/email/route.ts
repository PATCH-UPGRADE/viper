import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { inngest } from "@/inngest/client";

const resend = new Resend(process.env.RESEND_API_KEY);

// Verify Resend webhook
// Then send email to an inngest job for processing
export const POST = async (req: NextRequest) => {
  try {
    const payload = await req.text();

    const event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? "",
    });

    if (event.type === "email.received") {
      await inngest.send({
        name: "inbox/email.received",
        data: { emailId: event.data.email_id, raw: event },
      });
    }

    return NextResponse.json({});
  } catch {
    return new NextResponse("Invalid webhook", { status: 400 });
  }
};
