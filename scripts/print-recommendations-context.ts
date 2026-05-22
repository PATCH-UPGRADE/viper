#!/usr/bin/env tsx
import { getRecommendationsContext } from "@/features/chat/viper-agent/tools/get-recommendations-context";
import prisma from "@/lib/db";

async function main() {
  const user = await prisma.user.findFirstOrThrow({
    where: { email: "user@example.com" },
  });

  const result = await (
    getRecommendationsContext as unknown as {
      handler: (args: unknown, ctx: unknown) => Promise<string>;
    }
  ).handler(
    {},
    {
      network: {
        state: {
          data: { userId: user.id, userRole: "hospital administration" },
        },
      },
    },
  );

  process.stdout.write(`${result}\n`);
  await prisma.$disconnect();
}

main();
