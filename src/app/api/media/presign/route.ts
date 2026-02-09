import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import { getMediaTypeFromMime } from "@/domain/enums/media-type";
import { PresignUploadRequestDTO, PresignUploadResponseDTO } from "@/application/dto/media-dto";
import type { Tables } from "@/types/supabase";

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

    // Generate unique key for the file
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `media/${groupId}/${user.id}/${timestamp}-${sanitizedFilename}`;

    // Create media asset record
    const { data: asset, error: assetError } = (await supabase
      .from("media_assets")
      .insert({
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
      const thumbKey = `media/${groupId}/${user.id}/${timestamp}-thumb_${sanitizedFilename.replace(/\.[^.]+$/, "")}.jpg`;
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
