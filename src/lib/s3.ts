import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

function normalizeMd5(hash: string): string {
    const isHex = /^[0-9a-fA-F]{32}$/.test(hash);
    if (isHex) {
        return Buffer.from(hash, 'hex').toString('base64');
    }
  return hash;
}

export async function generateUploadUrl(fileName: string, hash: string, size: number) {
    const fileId = crypto.randomUUID();
    const s3Key = `artifacts/${fileId}-${fileName}`
    const normalized_hash = normalizeMd5(hash)

    const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
        ContentLength: size,
        ContentMD5: normalized_hash,
        ContentType: 'application/octet-stream',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // Expire upload URL after 1 hour
    return { uploadUrl, s3Key }

}