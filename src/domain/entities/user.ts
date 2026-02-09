export interface User {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface UpdateUserInput {
  displayName?: string;
  avatarUrl?: string | null;
}
