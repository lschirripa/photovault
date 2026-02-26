import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  IStorageService,
  PresignedUrl,
  UploadOptions,
} from "@/application/services/storage-service";
import { env } from "@/infrastructure/config/env";
import { R2_DELETE_BATCH_SIZE } from "@/infrastructure/config/limits";

export class R2StorageService implements IStorageService {
  private client: S3Client;
  private bucketName: string;

  constructor() {
    if (!env.r2.accountId || !env.r2.accessKeyId || !env.r2.secretAccessKey) {
      throw new Error(
        "R2 storage credentials are not configured. " +
        "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY."
      );
    }

    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
    });
    this.bucketName = env.r2.bucketName;
  }

  async generateUploadUrl(
    key: string,
    options: UploadOptions,
    expiresIn: number = 3600
  ): Promise<PresignedUrl> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: options.contentType,
      ContentLength: options.contentLength,
      Metadata: options.metadata,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return { url, key, expiresAt };
  }

  async generateDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // If public URL is configured, use it directly
    if (env.r2.publicUrl) {
      return `${env.r2.publicUrl}/${key}`;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.client.send(command);
  }

  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    // R2/S3 limits DeleteObjects to 1000 keys per request — chunk accordingly
    for (let i = 0; i < keys.length; i += R2_DELETE_BATCH_SIZE) {
      const batch = keys.slice(i, i + R2_DELETE_BATCH_SIZE);
      const command = new DeleteObjectsCommand({
        Bucket: this.bucketName,
        Delete: {
          Objects: batch.map((key) => ({ Key: key })),
        },
      });

      await this.client.send(command);
    }
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async getObjectMetadata(
    key: string
  ): Promise<{ contentType: string; contentLength: number; lastModified: Date } | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);

      return {
        contentType: response.ContentType || "application/octet-stream",
        contentLength: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
      };
    } catch {
      return null;
    }
  }
}

// Singleton instance
let storageService: R2StorageService | null = null;

export function getStorageService(): R2StorageService {
  if (!storageService) {
    storageService = new R2StorageService();
  }
  return storageService;
}
