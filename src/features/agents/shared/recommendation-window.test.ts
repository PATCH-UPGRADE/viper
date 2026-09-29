// @vitest-environment node
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  recommendationWindow,
  turnAwaitsRecommendation,
} from "./recommendation-window";

const user = (text: string) => new HumanMessage(text);
const assistantText = (text: string) => new AIMessage(text);
const assistantCalling = (...names: string[]) =>
  new AIMessage({
    content: "",
    tool_calls: names.map((name, i) => ({
      id: `call-${name}-${i}`,
      name,
      args: {},
    })),
  });
const toolResult = (name: string, i = 0) =>
  new ToolMessage({
    content: `${name} result`,
    tool_call_id: `call-${name}-${i}`,
    name,
  });

describe("recommendationWindow", () => {
  it("returns the notebook unchanged when nobody requested a recommendation", () => {
    const messages = [
      user("patch MRI-01 now or wait?"),
      user("(Context for you) notes"),
    ];
    expect(recommendationWindow(messages)).toEqual(messages);
  });

  it("drops the chat model's tool-call turns and keeps the conversation text", () => {
    const earlierAnswer = assistantText("Earlier plan text");
    const question = user("patch MRI-01 now or wait?");
    const context = user("(Context for you) notes");
    const messages = [
      earlierAnswer,
      question,
      context,
      assistantCalling("query_platform_data"),
      toolResult("query_platform_data"),
      assistantCalling("request_recommendation"),
      toolResult("request_recommendation"),
    ];
    expect(recommendationWindow(messages)).toEqual([
      earlierAnswer,
      question,
      context,
    ]);
  });

  it("keeps the recommendation node's own tool-call turns after the escalation", () => {
    const question = user("patch MRI-01 now or wait?");
    const recommendationCall = assistantCalling("query_platform_data");
    const recommendationResult = toolResult("query_platform_data");
    const messages = [
      question,
      assistantCalling("request_recommendation"),
      toolResult("request_recommendation"),
      recommendationCall,
      recommendationResult,
    ];
    expect(recommendationWindow(messages)).toEqual([
      question,
      recommendationCall,
      recommendationResult,
    ]);
  });

  it("drops every result of the batch that requested a recommendation", () => {
    const question = user("patch MRI-01 now or wait?");
    const messages = [
      question,
      assistantCalling("query_platform_data", "request_recommendation"),
      toolResult("query_platform_data"),
      toolResult("request_recommendation", 1),
    ];
    expect(recommendationWindow(messages)).toEqual([question]);
  });
});

describe("turnAwaitsRecommendation", () => {
  it("is true when the saved turn requested a recommendation and asked the user", () => {
    expect(
      turnAwaitsRecommendation([
        { type: "tool-request_recommendation", toolCallId: "a" },
        {
          type: "dynamic-tool",
          toolName: "ask_user_questions",
          toolCallId: "b",
        },
      ]),
    ).toBe(true);
  });

  it("is false when only the chat model asked the user", () => {
    expect(
      turnAwaitsRecommendation([
        { type: "tool-ask_user_questions", toolCallId: "b" },
      ]),
    ).toBe(false);
  });

  it("is false when the recommendation node answered without asking", () => {
    expect(
      turnAwaitsRecommendation([
        { type: "tool-request_recommendation", toolCallId: "a" },
        { type: "tool-query_platform_data", toolCallId: "c" },
      ]),
    ).toBe(false);
  });

  it("ignores saved parts that are not objects", () => {
    expect(turnAwaitsRecommendation([null, "text", 3])).toBe(false);
  });
});
