/**
 * Shared Viper agent graph shape (chat + recommendations):
 *
 *   preload (deterministic context) -> agent <-> tools
 *
 * - preload: loads mandatory context (memories, or full recommendations
 *   context) and injects it as a user-role message. Deterministic — NOT a
 *   forced model tool call — so extended thinking survives
 *   and the context is guaranteed loaded once per run.
 * - agent: the model (with tools bound), prepended with the system message.
 * - tools: ToolNode; if a HALT_TOOL was called, END so the user can act on it
 *   (human-in-the-loop): answer the questions, or accept/dismiss the proposed
 *   work order.
 */
import "server-only";
import {
  type AIMessage,
  type BaseMessage,
  HumanMessage,
  type SystemMessage,
  type ToolMessage,
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

/**
 * Tools that hand control back to the user: the turn ends after them and only
 * resumes when the user answers / accepts.
 */
const HALT_TOOLS = new Set(["ask_user_questions", "propose_fleet_work_order"]);

/**
 * A halting tool prefixes its result with this when it refuses the call (e.g. a
 * work order proposed for an asset Siemens doesn't manage). Such a turn must
 * NOT halt — the model has to see the refusal and correct itself or explain it,
 * and the UI must not render an approval card for a proposal that was rejected.
 */
export const TOOL_REJECTED_PREFIX = "REJECTED:";

/** Names of tools called in the most recent assistant tool-call turn. */
function lastToolCallNames(messages: BaseMessage[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as AIMessage;
    if (m.tool_calls?.length) return m.tool_calls.map((t) => t.name);
  }
  return [];
}

/** Results of the tool batch that just ran (the trailing ToolMessages). */
function trailingToolResults(messages: BaseMessage[]): string[] {
  const results: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.getType() !== "tool") break;
    const content = (m as ToolMessage).content;
    results.push(
      typeof content === "string" ? content : JSON.stringify(content),
    );
  }
  return results;
}

function shouldHalt(messages: BaseMessage[]): boolean {
  const halting = lastToolCallNames(messages).some((n) => HALT_TOOLS.has(n));
  if (!halting) return false;
  return !trailingToolResults(messages).some((r) =>
    r.startsWith(TOOL_REJECTED_PREFIX),
  );
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
      shouldHalt(state.messages) ? END : "agent",
    )
    .addConditionalEdges("agent", (state) =>
      lastAi(state.messages)?.tool_calls?.length ? "tools" : END,
    )
    .compile();
}
