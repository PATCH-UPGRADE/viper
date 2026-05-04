import { anthropic, createAgent } from "@inngest/agent-kit";

const MODEL = anthropic({
  model: "claude-haiku-4-5-20251001",
  defaultParameters: { max_tokens: 4096 },
});

const SYSTEM_PROMPT = [
  "You are a helpful AI assistant for a hospital vulnerability management platform (Viper).",
  "You help hospital administrators understand the operational impact of vulnerabilities",
  "and remediations across systems, safety, and clinical workflows.",
  "Be concise, accurate, and prioritize patient safety in your recommendations.",
].join(" ");

export const createChatAgent = () =>
  createAgent({
    name: "Viper Chat Assistant",
    description: "General assistant for hospital vulnerability management.",
    system: SYSTEM_PROMPT,
    model: MODEL,
  });
