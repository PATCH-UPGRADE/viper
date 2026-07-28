#!/usr/bin/env tsx

// Debug script used to return tool call output, largely just for token counting

import { loadRecommendationsContextMarkdown } from "@/features/chat/viper-agent/tools/get-recommendations-context";
import prisma from "@/lib/db";

async function main() {
  try {
    const result = await loadRecommendationsContextMarkdown(
      "hospital administration",
    );

    process.stdout.write(`${result}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
