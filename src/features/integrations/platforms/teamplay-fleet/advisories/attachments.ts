import "server-only";
import { z } from "zod";
import type { Session } from "../../../core/types";
import { advisoryAttachmentsDownloadUrl } from "../urls";

const downloadUrlSchema = z.object({ url: z.string() });

// biome-ignore lint/correctness/noUnusedVariables: kept for the advisory-PDF follow-up in the TODO below
async function resolveDownloadUrl(
  session: Session,
  externalId: string,
  fileType: string,
): Promise<string | null> {
  const res = await session.request(
    advisoryAttachmentsDownloadUrl(externalId, fileType),
  );
  if (!res.ok) {
    console.warn(
      `Fleet advisory ${externalId} download-url (${fileType}) returned ${res.status}`,
    );
    return null;
  }
  const parsed = downloadUrlSchema.safeParse(await res.json());
  if (!parsed.success) {
    console.warn(
      `Fleet advisory ${externalId} download-url returned no usable url`,
    );
    return null;
  }
  return parsed.data.url;
}
