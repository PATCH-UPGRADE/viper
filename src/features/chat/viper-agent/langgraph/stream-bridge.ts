/**
 * LangGraph -> AI SDK v5 UI message stream bridge.
 *
 * Maps `graph.streamEvents(..., { version: "v2" })` onto AI SDK UI chunks:
 *   - on_chat_model_stream -> reasoning-* / text-* deltas (thinking + answer)
 *   - on_chat_model_end    -> tool-input-available (clean tool_calls)
 *   - on_chain_end         -> tool-output-available (ToolMessages in node output)
 *
 * Tool OUTPUTS come from on_chain_end, NOT on_tool_end: when an earlier node
 * does async work (e.g. a DB query), streamEvents intermittently DROPS the
 * nested on_tool_end event (~33% observed), but the ToolMessage always lands in
 * a node's chain output. We dedupe by tool_call_id since the same ToolMessage
 * appears in both the tools-node and root-graph chain_end.
 *
 * Validated end-to-end in the Phase 0 spike (token + thinking + tool streaming).
 */
import "server-only";
import type { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { UIMessageChunk } from "ai";

/** Minimal writer surface — AI SDK's UIMessageStreamWriter, or a test spy. */
export interface UIChunkWriter {
  write: (chunk: UIMessageChunk) => void;
}

/** Clean tool_calls on an AIMessage -> tool-input-available chunks. */
export function aiMessageToToolInputChunks(msg: AIMessage): UIMessageChunk[] {
  const calls = msg.tool_calls ?? [];
  return calls.map((tc) => ({
    type: "tool-input-available" as const,
    toolCallId: tc.id ?? crypto.randomUUID(),
    toolName: tc.name,
    input: tc.args,
  }));
}

/** Normalize a ToolMessage's content to a displayable value. */
function normalizeToolOutput(content: ToolMessage["content"]): unknown {
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
  return content;
}

/** A ToolMessage -> tool-output-available chunk (matched via tool_call_id). */
export function toolMessageToOutputChunk(msg: ToolMessage): UIMessageChunk {
  return {
    type: "tool-output-available",
    toolCallId: msg.tool_call_id,
    output: normalizeToolOutput(msg.content),
  };
}

/**
 * Drive a compiled LangGraph graph and write AI SDK UI chunks to `writer`.
 * Caller owns the surrounding `start` / `finish` chunks.
 */
export async function streamGraphToUI({
  graph,
  input,
  writer,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: compiled graph type is heavy; loose is fine here
  graph: { streamEvents: (input: any, opts: any) => AsyncIterable<any> };
  // biome-ignore lint/suspicious/noExplicitAny: graph input shape varies
  input: any;
  writer: UIChunkWriter;
}): Promise<void> {
  // Each chat-model run gets its own text/reasoning block ids so multiple
  // agent turns don't collide on a single id.
  let run = 0;
  let textId: string | null = null;
  let reasoningId: string | null = null;
  // Tool outputs are deduped by tool_call_id (same ToolMessage surfaces in
  // several on_chain_end events).
  const emittedToolOutputs = new Set<string>();

  const emitToolOutputsFrom = (messages: unknown) => {
    if (!Array.isArray(messages)) return;
    for (const m of messages) {
      const msg = m as ToolMessage;
      const id = msg?.tool_call_id;
      if (!id || emittedToolOutputs.has(id)) continue;
      // A ToolMessage has both tool_call_id and content.
      if (typeof msg.content === "undefined") continue;
      emittedToolOutputs.add(id);
      writer.write(toolMessageToOutputChunk(msg));
    }
  };

  const openReasoning = () => {
    if (reasoningId) return;
    reasoningId = `reasoning-${run}`;
    writer.write({ type: "reasoning-start", id: reasoningId });
  };
  const closeReasoning = () => {
    if (!reasoningId) return;
    writer.write({ type: "reasoning-end", id: reasoningId });
    reasoningId = null;
  };
  const openText = () => {
    if (textId) return;
    textId = `text-${run}`;
    writer.write({ type: "text-start", id: textId });
  };
  const closeText = () => {
    if (!textId) return;
    writer.write({ type: "text-end", id: textId });
    textId = null;
  };

  const emitReasoning = (delta: string) => {
    if (!delta) return;
    openReasoning();
    writer.write({ type: "reasoning-delta", id: reasoningId as string, delta });
  };
  const emitText = (delta: string) => {
    if (!delta) return;
    // Anthropic streams all thinking before answer text.
    closeReasoning();
    openText();
    writer.write({ type: "text-delta", id: textId as string, delta });
  };

  for await (const ev of graph.streamEvents(input, { version: "v2" })) {
    switch (ev.event) {
      case "on_chat_model_start": {
        run += 1;
        break;
      }
      case "on_chat_model_stream": {
        const content = ev.data?.chunk?.content;
        if (typeof content === "string") {
          emitText(content);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (!block || typeof block !== "object") continue;
            if (block.type === "thinking") emitReasoning(block.thinking ?? "");
            else if (block.type === "text") emitText(block.text ?? "");
          }
        }
        break;
      }
      case "on_chat_model_end": {
        closeReasoning();
        closeText();
        const out = ev.data?.output as AIMessage | undefined;
        if (out?.tool_calls?.length) {
          for (const chunk of aiMessageToToolInputChunks(out)) writer.write(chunk);
        }
        break;
      }
      case "on_chain_end": {
        // ToolMessages reliably appear here (see file header). Emit + dedupe.
        emitToolOutputsFrom(ev.data?.output?.messages);
        break;
      }
      default:
        break;
    }
  }

  closeReasoning();
  closeText();
}
