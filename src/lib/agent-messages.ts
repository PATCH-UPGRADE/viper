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
 * which ride along as LangChain `file` blocks (OpenAI `input_file` on the wire)
 * so the model reads them beside the text rather than in a separate call.
 * OpenAI requires a filename for inline file data, so every block carries one.
 */
export function buildUserMessage(
  text: string,
  pdfAttachments: PdfAttachment[] = [],
): HumanMessage {
  return new HumanMessage({
    content: [
      ...pdfAttachments.map((pdf) => ({
        type: "file" as const,
        source_type: "base64" as const,
        mime_type: "application/pdf",
        data: pdf.base64,
        metadata: { filename: pdf.filename ?? "attachment.pdf" },
      })),
      { type: "text" as const, text },
    ],
  });
}
