import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import { getMediaTypeFromMime, MediaType } from "@/domain/enums/media-type";
import { PresignUploadRequestDTO, PresignUploadResponseDTO } from "@/application/dto/media-dto";
import { MAX_IMAGE_UPLOAD_SIZE, MAX_VIDEO_UPLOAD_SIZE } from "@/infrastructure/config/limits";
import { getUploadLimiter } from "@/infrastructure/redis/rate-limit";
import { checkRateLimit } from "@/infrastructure/redis/with-rate-limit";
import type { Tables } from "@/types/supabase";

/** Map of valid file extensions to their expected MIME types */
const EXTENSION_MIME_MAP: Record<string, string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  heic: ["image/heic"],
  heif: ["image/heif"],
  mp4: ["video/mp4"],
  mov: ["video/quicktime"],
  webm: ["video/webm"],
  avi: ["video/x-msvideo"],
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerComponentClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit
    const rateLimited = await checkRateLimit(getUploadLimiter(), user.id);
    if (rateLimited) return rateLimited;

    const body: PresignUploadRequestDTO = await request.json();
    const { groupId, filename, contentType, sizeBytes } = body;

    // Validate media type
    const mediaType = getMediaTypeFromMime(contentType);
    if (!mediaType) {
      return NextResponse.json(
        { error: "Unsupported media type" },
        { status: 400 }
      );
    }

    // Validate file extension matches claimed MIME type
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext) {
      const allowedMimes = EXTENSION_MIME_MAP[ext];
      if (allowedMimes && !allowedMimes.includes(contentType)) {
        return NextResponse.json(
          { error: `File extension .${ext} does not match content type ${contentType}` },
          { status: 400 }
        );
      }
    }

    // Validate upload size
    const maxSize = mediaType === MediaType.IMAGE ? MAX_IMAGE_UPLOAD_SIZE : MAX_VIDEO_UPLOAD_SIZE;
    if (sizeBytes > maxSize) {
      const maxMB = Math.round(maxSize / (1024 * 1024));
      return NextResponse.json(
        { error: `File too large. Maximum ${mediaType} upload size is ${maxMB}MB` },
        { status: 400 }
      );
    }

    // Verify user is a member of the group
    const { data: membership, error: membershipError } = (await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single()) as unknown as { data: { id: string } | null; error: Error | null };

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Not a member of this group" },
        { status: 403 }
      );
    }

    // Pre-generate assetId so it can be embedded directly in the R2 key.
    // New scheme: media/{groupId}/{YYYY}/{MM}/{assetId}-{filename}
    const assetId = crypto.randomUUID();
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `media/${groupId}/${year}/${month}/${assetId}-${sanitizedFilename}`;

    // Create media asset record
    const { data: asset, error: assetError } = (await supabase
      .from("media_assets")
      .insert({
        id: assetId,
        group_id: groupId,
        uploaded_by: user.id,
        filename,
        original_key: key,
        media_type: mediaType,
        mime_type: contentType,
        size_bytes: sizeBytes,
        status: "uploading",
      })
      .select()
      .single()) as { data: Tables<"media_assets"> | null; error: Error | null };

    if (assetError || !asset) {
      return NextResponse.json(
        { error: "Failed to create media record" },
        { status: 500 }
      );
    }

    // Generate presigned upload URL
    const storageService = getStorageService();
    const presigned = await storageService.generateUploadUrl(key, {
      contentType,
      contentLength: sizeBytes,
    });

    const response: PresignUploadResponseDTO = {
      uploadUrl: presigned.url,
      assetId: asset.id,
      key: presigned.key,
      expiresAt: presigned.expiresAt.toISOString(),
    };

    // For videos, generate a second presigned URL for the client-side thumbnail
    if (mediaType === "video") {
      const thumbKey = `thumbs/${groupId}/${year}/${month}/${assetId}.jpg`;
      const thumbPresigned = await storageService.generateUploadUrl(thumbKey, {
        contentType: "image/jpeg",
      });
      response.thumbnailUploadUrl = thumbPresigned.url;
      response.thumbnailKey = thumbKey;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Presign error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
