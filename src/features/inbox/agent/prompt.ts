// Prompt fragments shared by the inbound-email agents. Kept here rather than in
// @/lib because only the inbox deals in emails — the chat agents never see one.

export type InboundEmail = {
  from: string;
  subject: string | null;
  markdown: string;
};

/**
 * The sender/subject header and body block every inbound-email agent puts at
 * the top of its user prompt. `bodyLabel` names the body section; the extract
 * agent calls it a NOTIFICATION BODY, everything else an EMAIL BODY.
 */
export function emailPromptText(
  email: InboundEmail,
  bodyLabel = "EMAIL BODY",
): string {
  return `From: ${email.from}
Subject: ${email.subject ?? "(no subject)"}

--- ${bodyLabel} ---
${email.markdown}`;
}
