import { Group, CreateGroupInput, UpdateGroupInput } from "@/domain/entities/group";
import {
  GroupMember,
  CreateGroupMemberInput,
  UpdateGroupMemberInput,
} from "@/domain/entities/group-member";

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface IGroupRepository {
  findById(id: string): Promise<Group | null>;
  findByUserId(userId: string, options?: PaginationOptions): Promise<Group[]>;
  create(input: CreateGroupInput): Promise<Group>;
  update(id: string, input: UpdateGroupInput): Promise<Group>;
  delete(id: string): Promise<void>;
}

export interface IGroupMemberRepository {
  findByGroupId(groupId: string): Promise<GroupMember[]>;
  findByUserId(userId: string): Promise<GroupMember[]>;
  findByGroupAndUser(groupId: string, userId: string): Promise<GroupMember | null>;
  create(input: CreateGroupMemberInput): Promise<GroupMember>;
  update(id: string, input: UpdateGroupMemberInput): Promise<GroupMember>;
  delete(id: string): Promise<void>;
  deleteByGroupAndUser(groupId: string, userId: string): Promise<void>;
}
