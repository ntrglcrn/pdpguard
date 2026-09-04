import "server-only";

import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { HostedRuntimeConfig } from "@/lib/hosted-runtime-config";

const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

export interface ArtifactStore {
  put(contents: Buffer, contentType: "image/png"): Promise<string>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

/** Private S3-compatible storage. Keys are opaque and never authorize reads. */
export class S3ArtifactStore implements ArtifactStore {
  private readonly client: S3Client;

  constructor(private readonly config: HostedRuntimeConfig) {
    this.client = new S3Client({
      region: config.artifactRegion,
      endpoint: config.artifactEndpoint,
    });
  }

  async put(contents: Buffer, contentType: "image/png") {
    if (contents.byteLength > MAX_ARTIFACT_BYTES)
      throw new Error("The artifact exceeds its size limit.");
    const key = `artifacts/${randomUUID()}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.artifactBucket,
        Key: key,
        Body: contents,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async get(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.artifactBucket, Key: key }),
    ).catch((error: { name?: string }) => {
      if (error.name === "NoSuchKey" || error.name === "NotFound") return null;
      throw error;
    });
    if (!response?.Body) return null;
    if ((response.ContentLength ?? 0) > MAX_ARTIFACT_BYTES)
      throw new Error("The stored artifact exceeds its size limit.");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > MAX_ARTIFACT_BYTES)
        throw new Error("The stored artifact exceeds its size limit.");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, size);
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.artifactBucket, Key: key }),
    );
  }
}
