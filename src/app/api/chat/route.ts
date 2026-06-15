/**
 * Production streaming chat route (LangGraph + AI SDK UI), replacing the
 * Inngest fire-and-forget chat path. Holds the connection for the agent run and
 * streams token + reasoning + tool deltas back to `useChat`.
 */
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import type { AssetWithIssueRelations } from "@/features/assets/types";
import { USER_ROLES, type UserRole } from "@/features/chat/utils";
import { generateThreadTitle } from "@/features/chat/viper-agent/generate-thread-title";
import { buildChatGraph } from "@/features/chat/viper-agent/langgraph/chat-graph";
import {
  ensureThread,
  loadHistoryMessages,
  saveAssistantMessage,
  saveUserMessage,
  userMessageCount,
} from "@/features/chat/viper-agent/langgraph/history";
import { buildRecommendationsGraph } from "@/features/chat/viper-agent/langgraph/recommendations-graph";
import { streamGraphToUI } from "@/features/chat/viper-agent/langgraph/stream-bridge";
import type { VulnerabilityWithRelations } from "@/features/vulnerabilities/types";
import { getSession } from "@/lib/auth-utils";
import prisma from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ChatBody {
  messages: UIMessage[];
  threadId?: string;
  userRole?: UserRole;
  agent?: "chat" | "giveRecommendations";
  assetData?: AssetWithIssueRelations;
  vulnerabilityData?: VulnerabilityWithRelations;
}

function textOf(message: UIMessage | undefined): string {
  return (message?.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Pull the displayable text + tool parts out of the streamed response message. */
function splitAssistant(message: UIMessage): {
  content: string;
  // biome-ignore lint/suspicious/noExplicitAny: serialized UI tool parts
  toolCalls: any[];
} {
  const content = textOf(message);
  const toolCalls = (message.parts ?? []).filter(
    (p) => p.type === "dynamic-tool" || p.type.startsWith("tool-"),
  );
  return { content, toolCalls };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  const body = (await req.json()) as ChatBody;
  const userRole: UserRole = USER_ROLES.includes(body.userRole as UserRole)
    ? (body.userRole as UserRole)
    : "hospital administration";

  const newUserMessage = body.messages?.at(-1);
  if (!newUserMessage || newUserMessage.role !== "user") {
    return new Response("Last message must be from the user", { status: 400 });
  }
  const userText = textOf(newUserMessage);
  const threadId = body.threadId ?? crypto.randomUUID();
  const { agent, assetData, vulnerabilityData } = body;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Open the stream and flush the first chunk BEFORE the network-bound work.
      // On Vercel, any awaits before returning the Response delay the entire
      // body (perceived as "no streaming, just a spinner"), so all the DB
      // round-trips + graph run happen here, after the connection is live.
      writer.write({ type: "start" });

      // Persist the user's turn, then hydrate the full conversation from the DB
      // (authoritative — we don't trust client-side message state).
      await ensureThread(threadId, userId, userText);
      await saveUserMessage(threadId, newUserMessage.id, userText);
      const history = await loadHistoryMessages(threadId);

      const graph =
        agent === "giveRecommendations"
          ? buildRecommendationsGraph({
              userId,
              userRole,
              assetData,
              vulnerabilityData,
            })
          : buildChatGraph({ userId, userRole });

      await streamGraphToUI({ graph, input: { messages: history }, writer });
      writer.write({ type: "finish" });
    },
    onError: (error) =>
      error instanceof Error ? error.message : String(error),
    onFinish: async ({ responseMessage }) => {
      const { content, toolCalls } = splitAssistant(responseMessage);
      if (content.trim() || toolCalls.length) {
        await saveAssistantMessage(threadId, content, toolCalls);
      }
      // Title on the first exchange only.
      if ((await userMessageCount(threadId)) === 1) {
        const title = await generateThreadTitle({
          userMessage: userText,
          assistantText: content,
        });
        if (title) {
          await prisma.chatThread.update({
            where: { id: threadId, userId },
            data: { title },
          });
        }
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "x-thread-id": threadId,
      // `no-transform` stops edge proxies/CDNs from buffering or transforming
      // the SSE stream (belt-and-suspenders alongside the SDK's x-accel-buffering).
      "cache-control": "no-cache, no-transform",
    },
  });
}
