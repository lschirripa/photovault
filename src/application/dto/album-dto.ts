export interface CreateAlbumRequestDTO {
  groupId: string;
  name: string;
  description?: string;
  coverAssetId?: string;
}

export interface UpdateAlbumRequestDTO {
  name?: string;
  description?: string | null;
  coverAssetId?: string | null;
}

export interface AlbumResponseDTO {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  coverAssetId: string | null;
  coverIsDefault?: boolean;
  coverUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  mediaCount?: number;
}

export interface AlbumListResponseDTO {
  albums: AlbumResponseDTO[];
  total: number;
}

export interface AddMediaToAlbumRequestDTO {
  mediaIds: string[];
}

export interface RemoveMediaFromAlbumRequestDTO {
  mediaIds: string[];
}

export interface AlbumMediaResponseDTO {
  id: string;
  albumId: string;
  mediaId: string;
  addedAt: string;
  addedBy: string;
}
