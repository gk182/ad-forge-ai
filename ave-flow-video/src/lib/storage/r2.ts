import 'server-only';

import fs from 'fs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { hasR2UploadConfig, r2Config } from '@/config/env';

export interface R2UploadResult {
  storage: 'cloudflare-r2';
  objectKey: string;
  videoUrl: string;
}

let cachedClient: S3Client | null = null;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function getR2Client(): S3Client {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2Config.accessKeyId,
      secretAccessKey: r2Config.secretAccessKey,
    },
  });

  return cachedClient;
}

export function canUploadToR2() {
  return hasR2UploadConfig;
}

export function buildRenderObjectKey(filename: string, date = new Date()) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  return `renders/${year}/${month}/${filename}`;
}

export async function uploadFileToR2(filePath: string, objectKey: string): Promise<R2UploadResult> {
  if (!hasR2UploadConfig) {
    throw new Error('Cloudflare R2 upload is not configured.');
  }

  const body = fs.createReadStream(filePath);
  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: r2Config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: 'video/mp4',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return {
    storage: 'cloudflare-r2',
    objectKey,
    videoUrl: `${trimTrailingSlash(r2Config.publicBaseUrl)}/${objectKey}`,
  };
}
