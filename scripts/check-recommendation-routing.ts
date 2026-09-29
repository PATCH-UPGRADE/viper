#!/usr/bin/env tsx

import Module from "node:module";
import { fileURLToPath } from "node:url";

const serverOnlyStub = fileURLToPath(
  new URL("../src/test/server-only-stub.ts", import.meta.url),
);
const mod = Module as unknown as {
  _resolveFilename(request: string, ...rest: unknown[]): string;
};
const resolveFilename = mod._resolveFilename;
mod._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(
    this,
    request === "server-only" ? serverOnlyStub : request,
    ...rest,
  );
};

const QUESTIONS: [expected: "hand off" | "stay", question: string][] = [
  ["hand off", "Should we apply the patch for the CT scanner?"],
  ["hand off", "Which of our devices should we fix first?"],
  ["hand off", "Should I patch the CT scanner now or wait?"],
  ["hand off", "Our infusion pumps can't be patched. How do we protect them?"],
  ["hand off", "Is MRI-01 still safe to keep using?"],
  [
    "hand off",
    "Should we accept the risk on the patient monitors or mitigate it?",
  ],
  ["hand off", "When should we schedule downtime for the MRI firmware update?"],
  ["stay", "Is there a patch for the CT scanner vulnerabilities?"],
  ["stay", "How many critical vulnerabilities do we have?"],
  ["stay", "What does KEV mean?"],
  ["stay", "Which devices are affected by our critical vulnerabilities?"],
  ["stay", "What firmware is MR-MAGNETOM-001 running?"],
  ["stay", "Remember that our ICU ventilators are on firmware 3.2."],
  ["stay", "Write a report summarizing our open critical vulnerabilities."],
];

async function main() {
  const { ChatAnthropic } = await import("@langchain/anthropic");
  const { HumanMessage, SystemMessage } = await import(
    "@langchain/core/messages"
  );
  const { buildSystemPrompt } = await import("@/features/agents/chat/graph");
  const { buildAgentTools } = await import("@/features/agents/tools/registry");
  const { loadPersistentNotesMarkdown } = await import(
    "@/features/agents/shared/notes-preload"
  );
  const { default: prisma } = await import("@/lib/db");

  const user = await prisma.user.findFirstOrThrow({
    where: { email: "user@example.com" },
    select: { id: true },
  });
  const chatModel = new ChatAnthropic({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 1024,
  }).bindTools(buildAgentTools(user.id, "routing-check"));
  const system = new SystemMessage(
    buildSystemPrompt("hospital administration"),
  );
  const notes = new HumanMessage(
    `(Context for you)\n${await loadPersistentNotesMarkdown()}`,
  );

  let correct = 0;
  for (const [expected, question] of QUESTIONS) {
    const reply = await chatModel.invoke([
      system,
      new HumanMessage(question),
      notes,
    ]);
    const toolNames = (reply.tool_calls ?? []).map((call) => call.name);
    const handedOff = toolNames.includes("request_recommendation");
    const outcome = handedOff ? "hand off" : "stay";
    if (outcome === expected) correct++;
    console.log(
      `${outcome === expected ? "ok  " : "MISS"} expected ${expected.padEnd(8)} got ${(toolNames.join(",") || "text").padEnd(36)} ${question}`,
    );
  }
  console.log(`${correct}/${QUESTIONS.length} routed as expected`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
