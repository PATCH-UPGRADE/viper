import "server-only";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";

export const REQUEST_RECOMMENDATION_TOOL = "request_recommendation";
export const ASK_USER_QUESTIONS_TOOL = "ask_user_questions";

function toolCallNames(message: BaseMessage): string[] {
  if (message.type !== "ai") return [];
  const toolCalls = (message as AIMessage).tool_calls ?? [];
  return toolCalls.map((toolCall) => toolCall.name);
}

function isConversationText(message: BaseMessage): boolean {
  const type = message.type;
  if (type === "human") return true;
  return type === "ai" && toolCallNames(message).length === 0;
}

function recommendationRequestIndex(messages: BaseMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (toolCallNames(messages[i]).includes(REQUEST_RECOMMENDATION_TOOL))
      return i;
  }
  return -1;
}

export function recommendationWindow(messages: BaseMessage[]): BaseMessage[] {
  const requestedAt = recommendationRequestIndex(messages);
  if (requestedAt === -1) return messages;

  const conversationBeforeRequest = messages
    .slice(0, requestedAt)
    .filter(isConversationText);

  const afterRequest = messages.slice(requestedAt + 1);
  const firstRecommendationTurn = afterRequest.findIndex(
    (message) => message.type !== "tool",
  );
  const recommendationTurns =
    firstRecommendationTurn === -1
      ? []
      : afterRequest.slice(firstRecommendationTurn);

  return [...conversationBeforeRequest, ...recommendationTurns];
}

type SavedToolPart = { type?: string; toolName?: string };

function savedToolName(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  const { type, toolName } = part as SavedToolPart;
  if (typeof toolName === "string") return toolName;
  if (typeof type === "string" && type.startsWith("tool-")) {
    return type.slice("tool-".length);
  }
  return null;
}

export function turnAwaitsRecommendation(savedToolParts: unknown[]): boolean {
  const names = savedToolParts.map(savedToolName);
  return (
    names.includes(REQUEST_RECOMMENDATION_TOOL) &&
    names.includes(ASK_USER_QUESTIONS_TOOL)
  );
}
