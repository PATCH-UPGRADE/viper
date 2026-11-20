// The model settings for every agent, passed as-is to `new ChatOpenAI(...)`.
// On AWS, createChatModel adds the Bedrock endpoint, key and model ID to the same entry.

import type { ChatOpenAIFields } from "@langchain/openai";

const GPT_6_LUNA = "gpt-6-luna";
const GPT_6_1_SOL = "gpt-6.1-sol";

export const models = {
  "inbox.classify": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 1024,
  },
  "inbox.classify-kind": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 256,
  },
  "inbox.extract": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 4096,
  },
  "inbox.extract-work-order": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 1024,
  },
  "inbox.match": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 2048,
  },
  "inbox.triage": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 2048,
  },
  "inbox.question": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 4000,
  },
  "inbox.briefing": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 8000,
  },
  "inbox.vex": {
    model: GPT_6_1_SOL,
    useResponsesApi: true,
    reasoning: { effort: "medium" },
    maxTokens: 16000,
  },
  "inbox.mitigation": {
    model: GPT_6_1_SOL,
    useResponsesApi: true,
    reasoning: { effort: "medium" },
    maxTokens: 16000,
  },
  "chat.main": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 4096,
    streaming: true,
  },
  // The reasoning summary is what streams to the UI's reasoning block; without
  // summary: "auto" the API returns no reasoning text at all.
  "chat.recommendation": {
    model: GPT_6_1_SOL,
    useResponsesApi: true,
    reasoning: { effort: "high", summary: "auto" },
    maxTokens: 32000,
    streaming: true,
  },
  // No maxTokens: today's title call sets none
  "chat.title": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
  },
  "debrief.scout": {
    model: GPT_6_1_SOL,
    useResponsesApi: true,
    reasoning: { effort: "medium" },
    maxTokens: 16000,
  },
  "debrief.writer": {
    model: GPT_6_1_SOL,
    useResponsesApi: true,
    reasoning: { effort: "low" },
    maxTokens: 8000,
  },
  "integrations.ai-crawler": {
    model: GPT_6_1_SOL,
    useResponsesApi: true,
    reasoning: { effort: "medium" },
    maxTokens: 16000,
  },
  "csv.map-columns": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 2000,
  },
  "csv.map-values": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 2000,
  },
  "csv.match-names": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 4000,
  },
  "notes.extract": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 4096,
  },
  "notes.action": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 2048,
  },
  "questions.escalation-email": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 2000,
  },
  "scripts.recommendation-routing": {
    model: GPT_6_LUNA,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 1024,
  },
} satisfies Record<string, ChatOpenAIFields>;

export type ModelKey = keyof typeof models;
