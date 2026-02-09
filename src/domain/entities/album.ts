export interface Album {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  coverAssetId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlbumMedia {
  id: string;
  albumId: string;
  mediaId: string;
  addedAt: Date;
  addedBy: string;
}

export interface CreateAlbumInput {
  groupId: string;
  name: string;
  description?: string | null;
  coverAssetId?: string | null;
  createdBy: string;
}

export interface UpdateAlbumInput {
  name?: string;
  description?: string | null;
  coverAssetId?: string | null;
}

export interface AddMediaToAlbumInput {
  albumId: string;
  mediaId: string;
  addedBy: string;
}
