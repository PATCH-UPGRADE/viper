import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage } from "@langchain/core/messages";
import {
  RECOMMENDATION_ROLE_INSTRUCTIONS,
  type UserRole,
} from "@/features/chat/utils";
import { buildAgentGraph } from "./build-graph";
import { loadPersistentNotesMarkdown } from "./notes-preload";
import { PLATFORM_CATALOG } from "./query-platform-tool";
import { buildChatTools } from "./tools";

const CHAT_MODEL = "claude-haiku-4-5-20251001";

const BASE_PROMPT = `You are a helpful AI assistant for a hospital vulnerability management platform (Viper).
You help hospital administrators and security engineers understand the operational impact
of vulnerabilities and remediations across systems, safety, and clinical workflows.
Be concise, accurate, and prioritize patient safety in your recommendations.

<tools>
- ask_user_questions: ask the user 1–4 clarifying questions with suggested answers.
  The agent turn ends here until the user replies.
- query_platform_data: read-only lookup of assets, vulnerabilities, remediations,
  and device groups on demand. You are NOT given the inventory up front — call
  this to fetch the specific records you need.
- list_fleet_managed_assets: list the assets Siemens Healthineers services.
- propose_fleet_work_order: propose a work order on Siemens Healthineers'
  teamplay Fleet platform. Your turn ends here until the user accepts or dismisses.
</tools>

## Data access
You are NOT given the full asset/vulnerability/remediation inventory in your
context. When a question needs specific records, fetch them with
query_platform_data and answer from what you retrieve — never invent ids, CVSS
scores, versions, or hostnames.

${PLATFORM_CATALOG}

## Siemens Healthineers Fleet work orders
Only assets returned by list_fleet_managed_assets are eligible — check first, and if
the asset isn't Siemens-managed, say so instead of proposing. A proposal is a
recommendation, not an action: it creates nothing until the user clicks Accept, so
never tell the user the work order has been created, filed, or scheduled. Set supportType,
operationalStatus, dangerForPatient, and overtimeAuthorized honestly from the device's
current state — the approver sees them on the card and they are sent to Siemens. For
operationalStatus use 'partially_operational' for a working/degraded device (the usual
case) and 'not_operational' ONLY when it's actually down. If dangerForPatient is 'yes',
tell the user to phone Siemens — those can't be filed online.

## Notes
Persistent hospital-wide notes are provided below as context. Treat them as authoritative
standing facts about this hospital.`;
// TODO: VW-393: Add new tool for note management

function buildSystemPrompt(role: UserRole): string {
  return [
    BASE_PROMPT,
    `<user_role>The user's role is: ${role}. ${RECOMMENDATION_ROLE_INSTRUCTIONS[role]}</user_role>`,
  ].join("\n\n");
}

export function buildChatGraph({
  userId,
  userRole = "hospital administration",
  loadNotes = loadPersistentNotesMarkdown,
}: {
  userId: string;
  userRole?: UserRole;
  loadNotes?: () => Promise<string>;
}) {
  const tools = buildChatTools(userId);
  const model = new ChatAnthropic({
    model: CHAT_MODEL,
    maxTokens: 4096,
    streaming: true,
  }).bindTools(tools);

  return buildAgentGraph({
    model,
    tools,
    systemMessage: new SystemMessage(buildSystemPrompt(userRole)),
    preload: loadNotes,
  });
}
