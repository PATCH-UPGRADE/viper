/**
 * Shared Viper agent graph shape (chat + recommendations):
 *
 *   preload (deterministic context) -> agent <-> tools
 *
 * - preload: loads mandatory context (memories, or full recommendations
 *   context) and injects it as a user-role message. Deterministic — NOT a
 *   forced model tool call — so extended thinking survives (see SPIKE FINDING
 *   in the migration notes) and the context is guaranteed loaded once per run.
 * - agent: the model (with tools bound), prepended with the system message.
 * - tools: ToolNode; if ask_user_questions was called, END so the user can
 *   reply (human-in-the-loop), replacing the old hand-rolled network router.
 */
import "server-only";
import {
  type AIMessage,
  type BaseMessage,
  HumanMessage,
  type SystemMessage,
} from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import type { StructuredToolInterface } from "@langchain/core/tools";
import {
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";

const lastAi = (messages: BaseMessage[]) =>
  messages.at(-1) as AIMessage | undefined;

/** Names of tools called in the most recent assistant tool-call turn. */
function lastToolCallNames(messages: BaseMessage[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as AIMessage;
    if (m.tool_calls?.length) return m.tool_calls.map((t) => t.name);
  }
  return [];
}

export function buildAgentGraph({
  // biome-ignore lint/suspicious/noExplicitAny: bound chat model (post-bindTools) has a wide type
  model,
  tools,
  systemMessage,
  preload,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: bound chat model (post-bindTools) has a wide type
  model: Runnable<any, AIMessage>;
  tools: StructuredToolInterface[];
  systemMessage: SystemMessage;
  /** Returns the mandatory context markdown injected before the first turn. */
  preload: () => Promise<string>;
}) {
  return new StateGraph(MessagesAnnotation)
    .addNode("preload", async () => ({
      messages: [new HumanMessage(`(Context for you)\n${await preload()}`)],
    }))
    .addNode("agent", async (state) => ({
      messages: [await model.invoke([systemMessage, ...state.messages])],
    }))
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "preload")
    .addEdge("preload", "agent")
    .addConditionalEdges("tools", (state) =>
      lastToolCallNames(state.messages).includes("ask_user_questions")
        ? END
        : "agent",
    )
    .addConditionalEdges("agent", (state) =>
      lastAi(state.messages)?.tool_calls?.length ? "tools" : END,
    )
    .compile();
}
