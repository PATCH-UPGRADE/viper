#!/usr/bin/env tsx

// Debug script used to return tool call output, largely just for token counting

import { loadRecommendationsContextMarkdown } from "@/features/chat/viper-agent/tools/get-recommendations-context";
import prisma from "@/lib/db";

async function main() {
  try {
    const user = await prisma.user.findFirstOrThrow({
      where: { email: "user@example.com" },
    });

    const result = await loadRecommendationsContextMarkdown(
      user.id,
      "hospital administration",
    );

    process.stdout.write(`${result}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
