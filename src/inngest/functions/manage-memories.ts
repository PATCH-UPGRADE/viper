import "server-only";
import prisma from "@/lib/db";
import { inngest } from "../client";

type MemoryOperation = {
  id?: string;
  content?: string;
  delete?: boolean;
};

export const manageMemoriesFn = inngest.createFunction(
  { id: "manage-memories" },
  { event: "app/memories.manage" },
  async ({ event, step }) => {
    const { userId, operations } = event.data as {
      userId: string;
      operations: MemoryOperation[];
    };

    for (const [i, op] of operations.entries()) {
      if (op.delete && op.id) {
        await step.run(`delete-${op.id}`, () =>
          prisma.memory.delete({ where: { id: op.id, userId } }),
        );
      } else if (op.id && op.content) {
        await step.run(`update-${op.id}`, () =>
          prisma.memory.update({
            where: { id: op.id, userId },
            data: { content: op.content },
          }),
        );
      } else if (!op.id && op.content) {
        await step.run(`create-${i}`, () =>
          prisma.memory.create({ data: { userId, content: op.content } }),
        );
      }
    }

    return { processed: operations.length };
  },
);
