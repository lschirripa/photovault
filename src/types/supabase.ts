export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export interface Database {
  public: {
    Tables: {
      albums: {
        Row: {
          id: string;
          group_id: string;
          name: string;
          description: string | null;
          cover_asset_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          name: string;
          description?: string | null;
          cover_asset_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          name?: string;
          description?: string | null;
          cover_asset_id?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "albums_group_id_fkey";
            columns: ["group_id"];
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "albums_cover_asset_id_fkey";
            columns: ["cover_asset_id"];
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "albums_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      album_media: {
        Row: {
          id: string;
          album_id: string;
          media_id: string;
          added_at: string;
          added_by: string;
        };
        Insert: {
          id?: string;
          album_id: string;
          media_id: string;
          added_at?: string;
          added_by: string;
        };
        Update: {
          id?: string;
          album_id?: string;
          media_id?: string;
          added_at?: string;
          added_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "album_media_album_id_fkey";
            columns: ["album_id"];
            referencedRelation: "albums";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "album_media_media_id_fkey";
            columns: ["media_id"];
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "album_media_added_by_fkey";
            columns: ["added_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      group_invites: {
        Row: {
          id: string;
          group_id: string;
          token: string;
          created_by: string;
          expires_at: string | null;
          max_uses: number | null;
          use_count: number;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          token: string;
          created_by: string;
          expires_at?: string | null;
          max_uses?: number | null;
          use_count?: number;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          token?: string;
          created_by?: string;
          expires_at?: string | null;
          max_uses?: number | null;
          use_count?: number;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_invites_group_id_fkey";
            columns: ["group_id"];
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_invites_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string;
          email: string | null;
          avatar_url: string | null;
          pinned_group_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          email?: string | null;
          avatar_url?: string | null;
          pinned_group_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          email?: string | null;
          avatar_url?: string | null;
          pinned_group_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_pinned_group_id_fkey";
            columns: ["pinned_group_id"];
            referencedRelation: "groups";
            referencedColumns: ["id"];
          }
        ];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          cover_image_url: string | null;
          cover_media_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          cover_image_url?: string | null;
          cover_media_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          cover_image_url?: string | null;
          cover_media_id?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_cover_media_id_fkey";
            columns: ["cover_media_id"];
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          }
        ];
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          role: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          role?: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          role?: string;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      group_activities: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          activity_type: string;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          activity_type: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          activity_type?: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_activities_group_id_fkey";
            columns: ["group_id"];
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_activities_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      persons: {
        Row: {
          id: string;
          group_id: string;
          name: string | null;
          representative_face_id: string | null;
          centroid: string;
          face_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          name?: string | null;
          representative_face_id?: string | null;
          centroid: string;
          face_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          name?: string | null;
          representative_face_id?: string | null;
          centroid?: string;
          face_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "persons_group_id_fkey";
            columns: ["group_id"];
            referencedRelation: "groups";
            referencedColumns: ["id"];
          }
        ];
      };
      detected_faces: {
        Row: {
          id: string;
          media_asset_id: string;
          person_id: string | null;
          embedding: string;
          bbox_x: number;
          bbox_y: number;
          bbox_w: number;
          bbox_h: number;
          confidence: number;
          face_crop_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          media_asset_id: string;
          person_id?: string | null;
          embedding: string;
          bbox_x: number;
          bbox_y: number;
          bbox_w: number;
          bbox_h: number;
          confidence: number;
          face_crop_key?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          media_asset_id?: string;
          person_id?: string | null;
          embedding?: string;
          bbox_x?: number;
          bbox_y?: number;
          bbox_w?: number;
          bbox_h?: number;
          confidence?: number;
          face_crop_key?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "detected_faces_media_asset_id_fkey";
            columns: ["media_asset_id"];
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "detected_faces_person_id_fkey";
            columns: ["person_id"];
            referencedRelation: "persons";
            referencedColumns: ["id"];
          }
        ];
      };
      face_jobs: {
        Row: {
          id: string;
          media_asset_id: string;
          group_id: string;
          status: string;
          error: string | null;
          attempts: number;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          media_asset_id: string;
          group_id: string;
          status?: string;
          error?: string | null;
          attempts?: number;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          media_asset_id?: string;
          group_id?: string;
          status?: string;
          error?: string | null;
          attempts?: number;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "face_jobs_media_asset_id_fkey";
            columns: ["media_asset_id"];
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "face_jobs_group_id_fkey";
            columns: ["group_id"];
            referencedRelation: "groups";
            referencedColumns: ["id"];
          }
        ];
      };
      media_assets: {
        Row: {
          id: string;
          group_id: string;
          uploaded_by: string;
          filename: string;
          original_key: string;
          thumbnail_key: string | null;
          media_type: string;
          mime_type: string;
          size_bytes: number;
          width: number | null;
          height: number | null;
          duration_seconds: number | null;
          status: string;
          created_at: string;
          date_taken: string | null;
          latitude: number | null;
          longitude: number | null;
          altitude: number | null;
          camera_make: string | null;
          camera_model: string | null;
          lens_model: string | null;
          iso: number | null;
          f_number: number | null;
          exposure_time: string | null;
          focal_length: number | null;
          orientation: number | null;
          location_country: string | null;
          location_state: string | null;
          location_city: string | null;
        };
        Insert: {
          id?: string;
          group_id: string;
          uploaded_by: string;
          filename: string;
          original_key: string;
          thumbnail_key?: string | null;
          media_type: string;
          mime_type: string;
          size_bytes: number;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          status?: string;
          created_at?: string;
          date_taken?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          altitude?: number | null;
          camera_make?: string | null;
          camera_model?: string | null;
          lens_model?: string | null;
          iso?: number | null;
          f_number?: number | null;
          exposure_time?: string | null;
          focal_length?: number | null;
          orientation?: number | null;
          location_country?: string | null;
          location_state?: string | null;
          location_city?: string | null;
        };
        Update: {
          id?: string;
          group_id?: string;
          uploaded_by?: string;
          filename?: string;
          original_key?: string;
          thumbnail_key?: string | null;
          media_type?: string;
          mime_type?: string;
          size_bytes?: number;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          status?: string;
          created_at?: string;
          date_taken?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          altitude?: number | null;
          camera_make?: string | null;
          camera_model?: string | null;
          lens_model?: string | null;
          iso?: number | null;
          f_number?: number | null;
          exposure_time?: string | null;
          focal_length?: number | null;
          orientation?: number | null;
          location_country?: string | null;
          location_state?: string | null;
          location_city?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_group_id_fkey";
            columns: ["group_id"];
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_assets_uploaded_by_fkey";
            columns: ["uploaded_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
