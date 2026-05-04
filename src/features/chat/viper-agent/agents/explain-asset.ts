import {
  anthropic,
  createAgent,
  type NetworkRun,
  type StateData,
} from "@inngest/agent-kit";
import { ASSET_ROLE_INSTRUCTIONS, type UserRole } from "../../utils";
import { getAssetData } from "../tools/get-asset-data";

const MODEL = anthropic({
  model: "claude-haiku-4-5-20251001",
  defaultParameters: { max_tokens: 4096 },
});

const buildSystemPrompt = (
  network: NetworkRun<StateData> | undefined,
): string => {
  const data = network?.state.data as { userRole?: UserRole } | undefined;
  const role: UserRole = data?.userRole ?? "hospital administration";
  const roleInstructions = ASSET_ROLE_INSTRUCTIONS[role];

  return [
    "You are an AI assistant helping analyze a hospital asset in the Viper vulnerability management platform.",
    "Always call the get_asset_data tool first to retrieve full asset details before answering any question.",
    "Use the returned data to give accurate, grounded answers — do not invent numbers or details.",
    "",
    roleInstructions,
  ].join("\n");
};

export const createExplainAssetAgent = () =>
  createAgent({
    name: "Viper Asset Explainer",
    description:
      "Explains hospital asset security posture, vulnerabilities, and remediation options.",
    system: ({ network }) => buildSystemPrompt(network),
    tools: [getAssetData],
    model: MODEL,
  });
