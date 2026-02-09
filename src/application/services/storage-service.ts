export interface PresignedUrl {
  url: string;
  key: string;
  expiresAt: Date;
}

export interface UploadOptions {
  contentType: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}

export interface IStorageService {
  generateUploadUrl(
    key: string,
    options: UploadOptions,
    expiresIn?: number
  ): Promise<PresignedUrl>;

  generateDownloadUrl(key: string, expiresIn?: number): Promise<string>;

  deleteObject(key: string): Promise<void>;

  deleteObjects(keys: string[]): Promise<void>;

  objectExists(key: string): Promise<boolean>;

  getObjectMetadata(key: string): Promise<{
    contentType: string;
    contentLength: number;
    lastModified: Date;
  } | null>;
}
