import "server-only";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";

export const SOURCE_RECORD_RECORDED = "inbox/source-record.recorded" as const;

export interface SourceRecordRecorded {
  sourceRecordId: string;
  mappingId: string;
}

const MAX_PIPELINE_DISPATCH = 100;

export async function dispatchUnprocessedSnapshots(
  integrationId: string,
  externalIds: string[],
): Promise<number> {
  if (externalIds?.length === 0) return 0;
  const records = await prisma.sourceRecord.findMany({
    where: {
      mapping: {
        integrationId,
        externalId: { in: externalIds },
      },
      links: { none: {} },
    },
    select: { id: true, mappingId: true },
    orderBy: { observedAt: "asc" },
    take: MAX_PIPELINE_DISPATCH,
  });

  if (records.length === 0) return 0;

  await inngest.send(
    records.map((record) => ({
      name: SOURCE_RECORD_RECORDED,
      data: {
        sourceRecordId: record.id,
      },
    })),
  );
  return records.length;
}
