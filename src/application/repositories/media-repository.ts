import {
  MediaAsset,
  CreateMediaAssetInput,
  UpdateMediaAssetInput,
} from "@/domain/entities/media-asset";
import { MediaStatus } from "@/domain/enums/media-type";

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: "createdAt" | "filename";
  orderDirection?: "asc" | "desc";
}

export interface IMediaRepository {
  findById(id: string): Promise<MediaAsset | null>;
  findByGroupId(groupId: string, options?: PaginationOptions): Promise<MediaAsset[]>;
  findByUploaderId(uploaderId: string, options?: PaginationOptions): Promise<MediaAsset[]>;
  findByStatus(status: MediaStatus, options?: PaginationOptions): Promise<MediaAsset[]>;
  create(input: CreateMediaAssetInput): Promise<MediaAsset>;
  update(id: string, input: UpdateMediaAssetInput): Promise<MediaAsset>;
  delete(id: string): Promise<void>;
  countByGroupId(groupId: string): Promise<number>;
}
