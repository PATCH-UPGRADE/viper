import "server-only";

import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

const TITLE_MODEL = "gpt-6-luna";
const MAX_TITLE_LENGTH = 60;

const SYSTEM_PROMPT = `You name conversation threads. Given the first user message (and optionally the assistant's first reply), produce a concise 3-7 word title that captures the topic.

Rules:
- Output ONLY the title text. No quotes, no leading/trailing punctuation, no prefix like "Title:".
- 3 to 7 words. Title Case.
- Be specific to the topic, not generic ("ICU Monitor Patch Risk" not "Help With Question").`;

export async function generateThreadTitle(args: {
  userMessage: string;
  assistantText?: string;
}): Promise<string | null> {
  const userMessage = args.userMessage.trim();
  const assistantText = args.assistantText?.trim() ?? "";
  if (!userMessage) return null;

  const prompt = assistantText
    ? `User:\n${userMessage}\n\nAssistant:\n${assistantText}`
    : `User:\n${userMessage}`;

  try {
    const { text } = await generateText({
      model: openai(TITLE_MODEL),
      providerOptions: { openai: { reasoningEffort: "none" } },
      system: SYSTEM_PROMPT,
      prompt,
    });

    const cleaned = text
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/[.!?]+$/g, "")
      .trim();

    if (!cleaned) return null;
    return cleaned.length > MAX_TITLE_LENGTH
      ? cleaned.slice(0, MAX_TITLE_LENGTH).trimEnd()
      : cleaned;
  } catch {
    return null;
  }
}
