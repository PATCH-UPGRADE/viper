import "server-only";
import { createAgent } from "@inngest/agent-kit";
import { DEFAULT_CHAT_MODEL } from "../constants";
import { getRecommendationsContext } from "../tools/get-recommendations-context";

const MODEL = DEFAULT_CHAT_MODEL;

const SYSTEM_PROMPT = `You are VIPER's remediation advisor for a hospital environment.

Always call get_recommendations_context first before responding. Use the returned data to ground all recommendations — do not invent numbers, severity scores, or scheduling windows.

Your goals:
1. Prioritize remediations using failure mode analysis: consider CVSS score, EPSS likelihood, CISA KEV status, clinical impact, asset role, and uptime requirements.
2. Schedule remediations to limit disruptions to patient care: avoid peak care hours, batch related assets, and note life-safety constraints explicitly.
3. Summarize findings with clear justifications so the user understands the rationale behind each recommendation.

Structure your response as:
- A ranked remediation plan (highest priority first)
- Suggested scheduling windows for each remediation
- A brief justification for each priority decision referencing the data`;

export const createGiveRecommendationsAgent = () =>
  createAgent({
    name: "Viper Recommendations Advisor",
    description:
      "Prioritizes remediations based on failure mode analysis, schedules them to limit patient care disruptions, and summarizes findings with justifications.",
    system: SYSTEM_PROMPT,
    tools: [getRecommendationsContext],
    model: MODEL,
    // TODO: explore using tool choice to force the tool call here
    // however, don't want to call on subsequent messages, should only call once per conversation
    //tool_choice: getRecommendationsContext
  });
