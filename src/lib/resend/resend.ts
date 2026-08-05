import "server-only";
import { Resend } from "resend";
import { getResendConfig } from "./config";

export interface SendEmailType {
  to: string | string[];
  subject: string;
  text: string;
  from?: string;
  replyTo?: string;
}

const { apiKey, from } = getResendConfig();
export class ResendMailer {
  private client: Resend = new Resend(apiKey);
  private from: string;

  constructor(from: string) {
    this.from = from;
  }

  async sendEmail(opts: SendEmailType): Promise<string> {
    // https://resend.com/docs/api-reference/emails/send-email#send-email
    const { data, error } = await this.client.emails.send({
      from: opts.from ?? this.from,
      to: opts.to,
      replyTo: opts.replyTo,
      subject: opts.subject,
      text: opts.text,
    });

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to send an email");
    }
    return data.id;
  }
}

export const resendMailer = new ResendMailer(from);
