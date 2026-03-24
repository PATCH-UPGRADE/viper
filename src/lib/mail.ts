import "server-only";
import nodemailer from "nodemailer";

export type SendEmailOptions = {
  html?: string;
  subject: string;
  text: string;
  to: string | string[];
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth:
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
});

export async function sendEmail({ html, subject, text, to }: SendEmailOptions) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    html,
    subject,
    text,
    to,
  });
}
