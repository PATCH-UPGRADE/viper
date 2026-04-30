/*import { createAgent, anthropic } from "@inngest/agent-kit";

export type AdvisorState = {
  projectStatus: string | null;
  domain?: string;
};

// ---------------------------------------------------------------------------
// Chat agent system prompt
// ---------------------------------------------------------------------------

const MODEL_NAME = "claude-haiku-4-5-20251001";
const CHAT_SYSTEM_PROMPT = `<identity>
Be a chat agent for hospitals
</identity>
`;

type AdvisorAgentOptions = {
  messageId: string;
  systemPromptSuffix?: string;
  streamStatus: (status: string) => Promise<void>;
};

export function createChatAgent({
  messageId,
  systemPromptSuffix,
  streamStatus,
}: AdvisorAgentOptions) {
  const fullSystemPrompt = systemPromptSuffix
    ? CHAT_SYSTEM_PROMPT + systemPromptSuffix
    : CHAT_SYSTEM_PROMPT;

  // Notable tools that get a simple status label (terminal streams its own)
  /*const NOTABLE_TOOLS: Record<string, string> = {
    scrapeUrls: "Reading URLs...",
    readSandboxFile: "Reading sandbox file...",
    updateTargets: "Updating targets...",
  };*/

  /*return createAgent<AdvisorState>({
    name: "chat",
    description:
      "Answers questions and provides answers from the description",
    system: fullSystemPrompt,
    model: anthropic({
      model: MODEL_NAME,
      defaultParameters: { temperature: 0.3, max_tokens: 16000 },
    }),
    lifecycle: {
      onResponse: async ({ result }) => {
        // Stream text response to UI immediately
        const textMsg = result.output.find(
          (m) => m.type === "text" && m.role === "assistant",
        );
        if (textMsg?.type === "text") {
          const content =
            typeof textMsg.content === "string"
              ? textMsg.content
              : textMsg.content.map((c) => c.text).join("");
          if (content.trim()) {
            try {
              console.log(messageId, content);
              // TODO: save the message content where message.id = messageId
            } catch {
              // non-fatal
            }
          }
        }*/

        // Set status label for notable non-terminal tools about to run
        /*const toolCall = result.output.find((m) => m.type === "tool_call");
        if (toolCall?.type === "tool_call") {
          for (const tool of toolCall.tools) {
            if (tool.name in NOTABLE_TOOLS) {
              await streamStatus(NOTABLE_TOOLS[tool.name]);
              break;
            }
          }
        }*/

        /*return result;
      },
    },*/
/*    tools: [
      createListFilesTool({ internalKey, projectId }),
      createReadFilesTool({ internalKey }),
      createUpdateFileTool({ internalKey }),
      createCreateFilesTool({ projectId, internalKey }),
      createCreateFolderTool({ projectId, internalKey }),
      createRenameFileTool({ internalKey }),
      createDeleteFilesTool({ internalKey }),
      createUpdateTargetsTool({ internalKey, projectId }),
    ],*/
/*  });
}
*/
