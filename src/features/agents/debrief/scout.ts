import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { buildAgentGraph } from "@/features/agents/shared/build-graph";
import { loadPersistentNotesMarkdown } from "@/features/agents/shared/notes-preload";
import { makeQueryPlatformDataTool } from "@/features/agents/tools/query-platform-tool";
import { AUTOMATION_USER_ID } from "@/lib/automation-user";
import { SCOUT_SYSTEM_PROMPT } from "./prompts";

const SCOUT_MODEL = "claude-sonnet-5";

export const MAX_FINDINGS_CHARS = 20_000;

/**
 * Super-step budget for one scout run. LangGraph defaults to 25, roughly 12
 * tool rounds. The scout is asked for 6-10 findings across six domains and must
 * page notifications 10 rows at a time, so the default is reachable. Exceeding
 * it throws GraphRecursionError, and nobody is awake to retry a nightly run.
 */
const SCOUT_RECURSION_LIMIT = 60;

/**
 * The scout binds ONLY query_platform_data — deliberately not `buildAgentTools`.
 *
 * That registry contains `ask_user_questions` and `propose_fleet_work_order`,
 * both of which are HALT_TOOLS: the graph ends the turn and waits for a human.
 * The scout runs from a nightly cron with nobody to answer, so a single such
 * call would end the run with no findings. It also contains `record_note`,
 * which writes to the database — a read-only survey has no business doing that.
 */
function buildScoutGraph() {
  const tools = [makeQueryPlatformDataTool(AUTOMATION_USER_ID)];

  const model = new ChatAnthropic({
    model: SCOUT_MODEL,
    maxTokens: 8000,
    thinking: { type: "adaptive" },
  }).bindTools(tools);

  return buildAgentGraph({
    model,
    tools,
    systemMessage: new SystemMessage(SCOUT_SYSTEM_PROMPT),
    preload: loadPersistentNotesMarkdown,
  });
}

export async function runDebriefScout(): Promise<string> {
  const graph = buildScoutGraph();

  const result = await graph.invoke(
    {
      messages: [
        new HumanMessage(
          "Survey the fleet and report this morning's findings.",
        ),
      ],
    },
    { recursionLimit: SCOUT_RECURSION_LIMIT },
  );

  // BaseMessage.text flattens content blocks correctly, including the
  // block-type check a hand-rolled version is easy to get subtly wrong.
  const findings = (result.messages.at(-1)?.text ?? "").trim();

  // Fail loudly rather than hand the writer nothing. With no findings the
  // writer has only the department name to work from, and a model asked for
  // 3 bullets will produce 3 — invented ones. A thrown error lets the caller
  // mark the run Failed and leave yesterday's debrief in place.
  if (findings.length === 0) {
    throw new Error("Debrief scout returned no findings");
  }

  return findings.slice(0, MAX_FINDINGS_CHARS);
}
