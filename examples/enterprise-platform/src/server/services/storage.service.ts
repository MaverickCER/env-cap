import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { storageEnv } from "../../capabilities/storage/env.schema.js";

/**
 * `S3_ENDPOINT` (optional) points at s3rver's local endpoint in tests;
 * unset in production, where the real AWS endpoint is used -- the same
 * "declared, gracefully degraded" shape every other capability here follows,
 * just for a target endpoint instead of a present/absent credential.
 */
function client(): S3Client {
  return new S3Client({
    region: storageEnv.S3_REGION,
    endpoint: storageEnv.S3_ENDPOINT,
    forcePathStyle: storageEnv.S3_ENDPOINT !== undefined,
    credentials: {
      accessKeyId: storageEnv.S3_ACCESS_KEY_ID,
      secretAccessKey: storageEnv.S3_SECRET_ACCESS_KEY,
    },
  });
}

export async function uploadAttachment(key: string, content: string): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: storageEnv.S3_BUCKET, Key: key, Body: content }),
  );
}

export async function downloadAttachment(key: string): Promise<string> {
  const result = await client().send(
    new GetObjectCommand({ Bucket: storageEnv.S3_BUCKET, Key: key }),
  );
  const body = await result.Body?.transformToString();
  return body ?? "";
}
