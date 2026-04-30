/*import { inngest } from "@/inngest/client";
import { NonRetriableError } from "inngest";
import { createChatAgent } from "./agents/chat-agent";
//import { createTitleGeneratorAgent } from "./agents/title-generator-agent";
import { createNetwork } from "@inngest/agent-kit";

interface MessageEvent {
  messageId: string;
  threadId: string;
  message: string;
  userId?: string;
}

export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    cancelOn: [
      {
        event: "message/cancel",
        if: "event.data.messageId == async.data.messageId",
      },
    ],
    onFailure: async ({ event, step }) => {
      const { messageId } = event.data.event.data as MessageEvent;

      // Update the message with error content
      await step.run("update-message-on-failure", async () => {
        // TODO: update the message content here
        console.log(messageId, "content = OOPsy woopsy, there's been a mistake :(")
      });
    },
  },
  {
    event: "message/sent",
  },
  async ({ event, step }) => {
    const { messageId, threadId, message } =
      event.data as MessageEvent;

    // Get conversation for title generation check
    const conversation = await step.run("get-conversation", async () => {
      return await convex.query(api.system.getConversationById, {
        internalKey,
        conversationId,
      });
    });

    if (!conversation) {
      throw new NonRetriableError("Conversation not found");
    }

    // Fetch recent messages for conversation context
    const recentMessages = await step.run("get-recent-messages", async () => {
      return await convex.query(api.system.getRecentMessages, {
        internalKey,
        conversationId,
        limit: 10,
      });
    });

    // Filter out the current processing message and empty messages
    const contextMessages = recentMessages.filter(
      (msg) => msg._id !== messageId && msg.content.trim() !== "",
    );

    let historyText = "";
    if (contextMessages.length > 0) {
      historyText = contextMessages
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n\n");
    }

    // Generate conversation title if it's still the default
    const shouldGenerateTitle =
      conversation.title === DEFAULT_CONVERSATION_TITLE;

    if (shouldGenerateTitle) {
      const titleAgent = createTitleGeneratorAgent();

      const { output } = await titleAgent.run(message, { step });

      const textMessage = output.find(
        (m) => m.type === "text" && m.role === "assistant",
      );

      if (textMessage?.type === "text") {
        const title =
          typeof textMessage.content === "string"
            ? textMessage.content.trim()
            : textMessage.content
                .map((c) => c.text)
                .join("")
                .trim();

        if (title) {
          await step.run("update-conversation-title", async () => {
            await convex.mutation(api.system.updateConversationTitle, {
              internalKey,
              conversationId,
              title,
            });
          });
        }
      }
    }

    // Resolve sandbox ID for terminal tools — verify reachable, recreate if needed
    const sandboxId = await step.run("resolve-sandbox", async () => {
      const runner = await convex.query(api.runners.getRunnerByProject, {
        internalKey,
        projectId,
      });

      if (!runner || runner.status !== "running" || !runner.runtimeInstanceId) {
        return null;
      }

      // Try connecting (auto-resumes paused sandboxes)

    // Helper to push tool status updates to the UI
    const updateToolStatus = async (status: string) => {
      try {
        await convex.mutation(api.system.updateToolStatus, {
          messageId,
          toolStatus: status,
        });
      } catch {
        // non-fatal
      }
    };

    // Fetch project name for directory paths
    const project = await step.run("get-project", async () => {
      return await convex.query(api.system.getProjectByIdInternal, {
        internalKey,
        projectId,
      });
    });

    if (!project) {
      throw new NonRetriableError("Project not found");
    }

    let result;

          // --- Active phase: ReAct loop ---
    // Build project context so the advisor knows what files exist
    const projectFiles = await step.run("get-project-files", async () => {
      return await convex.query(api.system.getProjectFiles, {
        projectId,
      });
    });

    let systemPromptSuffix = "";

    if (projectFiles.length > 0) {
      const idToName = new Map<string, string>();
      for (const f of projectFiles) {
        idToName.set(f._id, f.name);
      }

      const pathOf = (f: (typeof projectFiles)[number]): string => {
        const parts: string[] = [f.name];
        const seen = new Set<string>();
        let cur = f.parentId;
        while (cur && idToName.has(cur) && !seen.has(cur)) {
          seen.add(cur);
          parts.unshift(idToName.get(cur)!);
          const parent = projectFiles.find((p) => p._id === cur);
          cur = parent?.parentId ?? undefined;
        }
        return parts.join("/");
      };

      const lines = projectFiles
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .map((f) => {
          const icon = f.type === "folder" ? "📁" : "📄";
          return `${icon} ${pathOf(f)}`;
        });

      systemPromptSuffix += `\n\n## Project Files\nThe project "${project.name}" (domain: ${project.domain ?? "not set"}) contains:\n\`\`\`\n${lines.join("\n")}\n\`\`\`\nUse listFiles and readFiles to inspect contents. Always read relevant files before answering questions about the project.`;

      if (historyText) {
        systemPromptSuffix += `\n\n## Previous Conversation\n${historyText}\n\n## Current Request\nRespond ONLY to the user's new message below.`;
      }

      const advisorAgent = createAdvisorAgent({
        messageId,
        systemPromptSuffix: systemPromptSuffix || undefined,
        streamStatus: updateToolStatus,
      });

      const network = createNetwork({
        name: "advisor-react",
        agents: [advisorAgent],
        maxIter: 20,
        router: ({ network }) => {
          const lastResult = network.state.results.at(-1);
          const hasTextResponse = lastResult?.output.some(
            (m) => m.type === "text" && m.role === "assistant",
          );
          const hasToolCalls = lastResult?.output.some(
            (m) => m.type === "tool_call",
          );

          // Keep looping while the agent is calling tools.
          // Stop when it produces a text-only response (final answer).
          if (hasTextResponse && !hasToolCalls) {
            return undefined;
          }
          return advisorAgent;
        },
      });

      result = await network.run(message);
    }

    // Extract the assistant's text response from the last agent result
    const lastResult = result.state.results.at(-1);
    const textMessage = lastResult?.output.find(
      (m) => m.type === "text" && m.role === "assistant",
    );

    let assistantResponse =
      "I processed your request. Let me know if you need anything else!";

    if (textMessage?.type === "text") {
      assistantResponse =
        typeof textMessage.content === "string"
          ? textMessage.content
          : textMessage.content.map((c) => c.text).join("");
    }

    // Update the assistant message with the response (this also sets status to completed)
    await step.run("update-assistant-message", async () => {
      await convex.mutation(api.system.updateMessageContent, {
        internalKey,
        messageId,
        content: assistantResponse,
      });
    });

    return { success: true, messageId, conversationId };
  },
);*/
