import { MAX_REQUEST_BYTES } from "../contract";

const encoder = new TextEncoder();

export const REQUEST_ENVELOPE_BYTES = 16 * 1024;

export const jsonByteLength = (value: unknown): number =>
  encoder.encode(JSON.stringify(value)).length;

export const chunkBySize = <T>(
  items: T[],
  maxBytes: number = MAX_REQUEST_BYTES - REQUEST_ENVELOPE_BYTES,
): T[][] => {
  const chunks: T[][] = [];
  let currentChunk: T[] = [];
  let currentChunkBytes = 0;
  for (const item of items) {
    const itemBytes = jsonByteLength(item) + 1;
    const chunkWouldOverflow =
      currentChunk.length > 0 && currentChunkBytes + itemBytes > maxBytes;
    if (chunkWouldOverflow) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChunkBytes = 0;
    }
    currentChunk.push(item);
    currentChunkBytes += itemBytes;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
};
