import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { artifactInputSchema } from "@/features/artifacts/types";

type ArtifactInput = z.infer<typeof artifactInputSchema>;

/**
 * Central S3 client used across Viper
 */
export const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * Handler for hex MD5
 * S3 requires Base64 MD5 in Content-MD5 header
 */
function normalizeMd5(hash: string): string {
  const isHex = /^[0-9a-fA-F]{32}$/.test(hash);
  if (isHex) {
    return Buffer.from(hash, "hex").toString("base64");
  }
  return hash;
}

/**
 * Process artifacts for uploading to S3
 */
export const processArtifactHosting = async (artifacts: ArtifactInput[]) => {
  const uploadInstructions: {
    artifactName: string;
    uploadUrl: string;
    requiredHeader: string;
  }[] = [];

  const processedArtifacts = await Promise.all(
    artifacts.map(async (art) => {
      if (art.hash && art.size && !art.downloadUrl) {
        const { uploadUrl, s3Key, requiredHeader } = await generateUploadUrl(
          art.name ?? "artifact",
          art.hash,
          art.size,
        );

        uploadInstructions.push({
          artifactName: art.name ?? "artifact",
          uploadUrl,
          requiredHeader,
        });
        return {
          ...art,
          downloadUrl: buildDownloadUrl(s3Key),
        };
      }
      return art;
    }),
  );
  return { processedArtifacts, uploadInstructions };
};

/**
 * Generates a presigned S3 PUT URL for uploading an artifact
 */
export async function generateUploadUrl(
  fileName: string,
  hash: string,
  size: number,
) {
  const fileId = crypto.randomUUID();
  const s3Key = `artifacts/${fileId}-${fileName}`;
  const normalized_hash = normalizeMd5(hash);

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
    ContentLength: size,
    ContentMD5: normalized_hash,
    ContentType: "application/octet-stream",
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // Expire upload URL after 1 hour
  return { uploadUrl, s3Key, requiredHeader: normalized_hash };
}

/**
 *
 * Builds an S3 download URL for a given artifact
 */
export function buildDownloadUrl(key: string): string {
  return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}
