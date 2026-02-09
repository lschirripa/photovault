export interface Group {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGroupInput {
  name: string;
  description?: string | null;
  coverImageUrl?: string | null;
  createdBy: string;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  coverImageUrl?: string | null;
}
