import "server-only";

import { anthropic } from "@inngest/agent-kit";

export const DEFAULT_CHAT_MODEL = anthropic({
  model: "claude-haiku-4-5-20251001",
  defaultParameters: { max_tokens: 4096 },
});
