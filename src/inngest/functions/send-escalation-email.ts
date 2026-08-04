import "server-only";
import { resendMailer } from "@/lib/resend/resend";
import { inngest } from "../client";

const SEND_EMAIL_EVENT = "escalation/email.send.requested" as const;

export interface sendEscalationEmailPayload {
  toEmails: string[];
  subject: string;
  body: string;
}

export async function sendEscalationEmail(
  payload: sendEscalationEmailPayload,
): Promise<void> {
  try {
    await inngest.send({ name: SEND_EMAIL_EVENT, data: payload });
  } catch (error) {
    console.warn(`Failed to send email, ${error}`);
  }
}

export const sendEscalationEmailFn = inngest.createFunction(
  {
    id: "send-escalation-email",
  },
  {
    event: SEND_EMAIL_EVENT,
  },
  async ({ event, step }) => {
    const { toEmails, subject, body } =
      event.data as sendEscalationEmailPayload;

    const emailId = await step.run("send-email", () => {
      resendMailer.sendEmail({ to: toEmails, subject, text: body });
    });

    return { sent: true, emailId };
  },
);
