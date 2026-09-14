/**
 * Shared Viper agent graph shape:
 *
 *   preload (deterministic context) -> agent <-> tools
 *
 * - preload: loads mandatory context (the hospital-wide persistent notes) and
 *   injects it as a user-role message
 * - agent: the model (with tools bound), prepended with the system message.
 * - tools: ToolNode; if a HALT_TOOL was called, END so the user can act on it
 *   (human-in-the-loop): answer the questions, or accept/dismiss the proposed
 *   work order.
 * - recommendation (optional): a second model the agent hands the turn to by calling
 *   request_recommendation. It runs the same tools loop with its own system message
 *   and sees the conversation through recommendationWindow.
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
  Annotation,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  REQUEST_RECOMMENDATION_TOOL,
  recommendationWindow,
} from "./recommendation-window";

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  recommending: Annotation<boolean>({
    reducer: (_current, incoming) => incoming,
    default: () => false,
  }),
});

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

// biome-ignore lint/suspicious/noExplicitAny: bound chat model (post-bindTools) has a wide type
type BoundModel = Runnable<any, AIMessage>;

function routeAfterModel(state: typeof AgentState.State) {
  return lastAi(state.messages)?.tool_calls?.length ? "tools" : END;
}

export function buildAgentGraph({
  model,
  tools,
  systemMessage,
  preload,
  recommendation,
}: {
  model: BoundModel;
  tools: StructuredToolInterface[];
  systemMessage: SystemMessage;
  /** Returns the mandatory context markdown injected before the first turn. */
  preload: () => Promise<string>;
  /** A second model the agent hands the turn to by calling request_recommendation. */
  recommendation?: { model: BoundModel; systemMessage: SystemMessage };
}) {
  const graph = new StateGraph(AgentState)
    .addNode("preload", async () => ({
      messages: [new HumanMessage(`(Context for you)\n${await preload()}`)],
    }))
    .addNode("agent", async (state) => ({
      messages: [await model.invoke([systemMessage, ...state.messages])],
    }))
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "preload")
    .addConditionalEdges("agent", routeAfterModel);

  if (!recommendation) {
    return graph
      .addEdge("preload", "agent")
      .addConditionalEdges("tools", (state) =>
        shouldHalt(state.messages) ? END : "agent",
      )
      .compile();
  }

  return graph
    .addNode("recommendation", async (state) => ({
      messages: [
        await recommendation.model.invoke([
          recommendation.systemMessage,
          ...recommendationWindow(state.messages),
        ]),
      ],
      recommending: true,
    }))
    .addConditionalEdges("preload", (state) =>
      state.recommending ? "recommendation" : "agent",
    )
    .addConditionalEdges("tools", (state) => {
      if (shouldHalt(state.messages)) return END;
      const agentJustEscalated = lastToolCallNames(state.messages).includes(
        REQUEST_RECOMMENDATION_TOOL,
      );
      if (state.recommending || agentJustEscalated) return "recommendation";
      return "agent";
    })
    .addConditionalEdges("recommendation", routeAfterModel)
    .compile();
}
