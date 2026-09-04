import "server-only";
import { z } from "zod";
import type { Session } from "../../../core/types";
import { advisoryAttachmentsDownloadUrl } from "../urls";

const downloadUrlSchema = z.object({ url: z.string() });

// {
// 	"url": "https://storage.fleet.siemens-healthineers.com/security-advisories/25%2Fpdf%2Ffile%2F260202%20%20Security%20Advisory%20016040.pdf?sv=2021-10-04&spr=https&se=2026-06-23T19%3A32%3A32Z&sp=r&sig=KqOSWueof8fE9ftCYdCE9SbcoRw2k1bumLpfli0jexg%3D&sr=b&rscd=attachment%3B%20filename%3D260202%20%20Security%20Advisory%20016040.pdf"
// }
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

// TODO Store the attachment in notificationAttachment?
