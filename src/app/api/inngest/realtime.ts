import "server-only";

// app/api/inngest/realtime.ts
import type { AgentMessageChunk } from "@inngest/agent-kit";
import { channel, topic } from "@inngest/realtime";

export const createChannel = channel((userId: string) => `user:${userId}`)
  .addTopic(topic("agent_stream").type<AgentMessageChunk>())
  .addTopic(
    topic("thread_updated").type<{ threadId: string; title: string }>(),
  );
