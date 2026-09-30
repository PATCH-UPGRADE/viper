// VEX sorting agent: given a notification that has linked vulnerabilities, sort
// each baseline Issue into AFFECTED, UNDER_INVESTIGATION, or NOT_AFFECTED
// May also create asset-level override issues when a single asset differs from
// its group.

import "server-only";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import {
  gatherVexContext,
  SYSTEM_PROMPT,
  VEX_TOOL_NAME,
  type VexContext,
} from "./context";
import { applyVexDeterminations, type VexApplySummary } from "./process_output";
import { buildVexSchema, type VexResult } from "./tools";

const MODEL = "gpt-6.1-sol";

export async function sortVulnerabilities(
  context: VexContext,
): Promise<VexResult> {
  const issueIds = context.issues.map((i) => i.issueId);
  const schema = buildVexSchema(issueIds);

  const recordTool = tool(async () => "ok", {
    name: VEX_TOOL_NAME,
    description:
      "Record the issue status determination for each issue, keyed by id. Omit issues that are unchanged.",
    schema,
  });

  // Bind the single recording tool, force the call, and read its args. The args
  // are re-validated against the schema below. Reasoning tokens count toward
  // maxTokens, so leave room for them on top of the recorded output.
  const model = new ChatOpenAI({
    model: MODEL,
    maxTokens: 16000,
    useResponsesApi: true,
    reasoning: { effort: "medium" },
  }).bindTools([recordTool], { tool_choice: "required" });

  const res = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: context.markdown },
  ]);

  // Fail loud
  const call = res.tool_calls?.find((c) => c.name === VEX_TOOL_NAME);
  if (!call) {
    throw new Error(
      `VEX agent never called ${VEX_TOOL_NAME} for notification ${context.notificationId}`,
    );
  }

  const parsed = schema.safeParse(call.args);
  if (!parsed.success) {
    throw new Error(
      `VEX agent returned invalid ${VEX_TOOL_NAME} args for notification ${context.notificationId}: ${z.prettifyError(parsed.error)}`,
    );
  }

  return parsed.data as VexResult;
}

/**
 * End-to-end entry point used by the inbox pipeline: gather context, run the
 * agent, and apply the result. Returns null when the notification has no linked
 * vulnerabilities / issues to sort.
 */
export async function sortNotificationVulnerabilities(
  notificationId: string,
): Promise<(VexApplySummary & { issues: number }) | null> {
  const context = await gatherVexContext(notificationId);
  if (!context) return null;
  const result = await sortVulnerabilities(context);
  const summary = await applyVexDeterminations(context, result);
  return { ...summary, issues: context.issues.length };
}
