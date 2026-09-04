#!/usr/bin/env tsx

// Debug script: prints the prompt the recommendations agent receives before its
// first turn — the system message plus the deterministically preloaded context
// message — largely just for token counting.

import Module from "node:module";
import { fileURLToPath } from "node:url";

// Stub server-only to avoid getting an error when we import from client
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

async function main() {
  const { USER_ROLES } = await import("@/features/chat/utils");
  const { buildSystemPrompt } = await import(
    "@/features/agents/recommendations/graph"
  );
  const { loadPersistentNotesMarkdown } = await import(
    "@/features/agents/shared/notes-preload"
  );
  const { default: prisma } = await import("@/lib/db");

  const roleArg = process.argv[2] ?? "hospital administration";
  if (!USER_ROLES.includes(roleArg as (typeof USER_ROLES)[number])) {
    throw new Error(
      `Unknown role "${roleArg}". Valid roles: ${USER_ROLES.join(", ")}`,
    );
  }
  const role = roleArg as (typeof USER_ROLES)[number];

  try {
    // The system message buildAgentGraph prepends to every model call in its
    // "agent" node.
    const systemPrompt = buildSystemPrompt(role);

    // The deterministic context buildAgentGraph injects as a HumanMessage in its
    // "preload" node, before the agent's first turn.
    const contextMessage = `(Context for you)\n${await loadPersistentNotesMarkdown()}`;

    process.stdout.write("===== SYSTEM MESSAGE =====\n\n");
    process.stdout.write(`${systemPrompt}\n\n`);
    process.stdout.write("===== CONTEXT MESSAGE (role: user) =====\n\n");
    process.stdout.write(`${contextMessage}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
