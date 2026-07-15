// Shared builders for the user message sent to an agent. Any agent that reads
// attached documents alongside its prompt goes through here.

import "server-only";
import { HumanMessage } from "@langchain/core/messages";

export type PdfAttachment = {
  filename: string | null;
  base64: string;
};

/**
 * Build an agent's user message from its prompt text plus any PDF attachments,
 * which ride along as Anthropic `document` blocks so the model reads them
 * beside the text rather than in a separate call.
 */
export function buildUserMessage(
  text: string,
  pdfAttachments: PdfAttachment[] = [],
): HumanMessage {
  const content = [
    { type: "text" as const, text },
    ...pdfAttachments.map((pdf) => ({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: pdf.base64,
      },
      title: pdf.filename ?? "attachment.pdf",
    })),
  ];

  // biome-ignore lint/suspicious/noExplicitAny: LangChain's content type doesn't model Anthropic document blocks
  return new HumanMessage({ content: content as any });
}
