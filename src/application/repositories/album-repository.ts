import type {
  Album,
  AlbumMedia,
  CreateAlbumInput,
  UpdateAlbumInput,
  AddMediaToAlbumInput,
} from "@/domain/entities/album";

export interface IAlbumRepository {
  findById(id: string): Promise<Album | null>;
  findByGroupId(groupId: string): Promise<Album[]>;
  create(input: CreateAlbumInput): Promise<Album>;
  update(id: string, input: UpdateAlbumInput): Promise<Album | null>;
  delete(id: string): Promise<boolean>;
}

export interface IAlbumMediaRepository {
  findByAlbumId(albumId: string): Promise<AlbumMedia[]>;
  findMediaIdsByAlbumId(albumId: string): Promise<string[]>;
  findAlbumIdsByMediaId(mediaId: string): Promise<string[]>;
  addMedia(input: AddMediaToAlbumInput): Promise<AlbumMedia>;
  addMediaBatch(inputs: AddMediaToAlbumInput[]): Promise<AlbumMedia[]>;
  removeMedia(albumId: string, mediaId: string): Promise<boolean>;
  removeMediaBatch(albumId: string, mediaIds: string[]): Promise<boolean>;
}
