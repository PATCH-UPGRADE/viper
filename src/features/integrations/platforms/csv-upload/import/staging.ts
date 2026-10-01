import "server-only";
import { z } from "zod";
import { downloadBufferFromS3, uploadBufferToS3 } from "@/lib/s3";
import { type StagedRow, stagedRowSchema } from "../contract";

const stagedChunkSchema = z.array(stagedRowSchema);

const chunkKey = (importId: string, chunkIndex: number): string =>
  `csv-imports/${importId}/${chunkIndex}.json`;

export async function putChunk(
  importId: string,
  chunkIndex: number,
  rows: StagedRow[],
): Promise<void> {
  const chunkJson = Buffer.from(JSON.stringify(rows));
  await uploadBufferToS3(
    chunkJson,
    chunkKey(importId, chunkIndex),
    "application/json",
  );
}

export async function getChunk(
  importId: string,
  chunkIndex: number,
): Promise<StagedRow[]> {
  const chunkJson = await downloadBufferFromS3(chunkKey(importId, chunkIndex));
  return stagedChunkSchema.parse(JSON.parse(chunkJson.toString("utf8")));
}
