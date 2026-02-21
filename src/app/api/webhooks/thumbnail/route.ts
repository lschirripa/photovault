import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import {
  extractMetadata,
  supportsMetadataExtraction,
} from "@/infrastructure/services/metadata-extraction-service";
import { THUMBNAIL_MAX_FILE_SIZE } from "@/infrastructure/config/limits";
import { getWebhookLimiter } from "@/infrastructure/redis/rate-limit";
import { checkRateLimit } from "@/infrastructure/redis/with-rate-limit";
import type { Tables } from "@/types/supabase";

export async function POST(request: NextRequest) {
  try {
    const { assetId } = await request.json();

    if (!assetId) {
      return NextResponse.json({ error: "Missing assetId" }, { status: 400 });
    }

    // Rate limit per asset
    const rateLimited = await checkRateLimit(getWebhookLimiter(), `asset:${assetId}`);
    if (rateLimited) return rateLimited;

    const supabase = createServiceClient();

    // Get the asset
    const { data: asset, error: assetError } = (await supabase
      .from("media_assets")
      .select("*")
      .eq("id", assetId)
      .single()) as unknown as { data: Tables<"media_assets"> | null; error: Error | null };

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Only process images for now (video thumbnails would require ffmpeg)
    if (asset.media_type !== "image") {
      // Mark as ready without thumbnail
      await supabase
        .from("media_assets")
        .update({ status: "ready" })
        .eq("id", assetId);

      return NextResponse.json({ success: true, thumbnail: false });
    }

    // File size guard: skip thumbnail for very large files to prevent OOM
    if (asset.size_bytes && asset.size_bytes > THUMBNAIL_MAX_FILE_SIZE) {
      console.warn(
        `Skipping thumbnail for asset ${assetId}: ${asset.size_bytes} bytes exceeds ${THUMBNAIL_MAX_FILE_SIZE} limit`
      );

      // Still extract EXIF (reads only header bytes, very lightweight)
      let metadataUpdate: Record<string, unknown> = {};
      if (supportsMetadataExtraction(asset.media_type)) {
        try {
          const storageService = getStorageService();
          const originalUrl = await storageService.generateDownloadUrl(asset.original_key);
          // Fetch only the first 256KB for EXIF extraction
          const headResponse = await fetch(originalUrl, {
            headers: { Range: "bytes=0-262143" },
          });
          if (headResponse.ok) {
            const headBuffer = Buffer.from(await headResponse.arrayBuffer());
            const metadata = await extractMetadata(headBuffer);
            metadataUpdate = {
              date_taken: metadata.dateTaken?.toISOString() ?? null,
              latitude: metadata.latitude,
              longitude: metadata.longitude,
              altitude: metadata.altitude,
              camera_make: metadata.cameraMake,
              camera_model: metadata.cameraModel,
              lens_model: metadata.lensModel,
              iso: metadata.iso,
              f_number: metadata.fNumber,
              exposure_time: metadata.exposureTime,
              focal_length: metadata.focalLength,
              orientation: metadata.orientation,
              location_country: metadata.locationCountry,
              location_state: metadata.locationState,
              location_city: metadata.locationCity,
            };
          }
        } catch (metadataError) {
          console.error("Failed to extract metadata for oversized asset:", metadataError);
        }
      }

      await supabase
        .from("media_assets")
        .update({ status: "ready", ...metadataUpdate })
        .eq("id", assetId);

      // Enqueue face detection even without thumbnail
      await supabase.from("face_jobs").insert({
        media_asset_id: assetId,
        group_id: asset.group_id,
      });

      return NextResponse.json({ success: true, thumbnail: false, reason: "oversized" });
    }

    try {
      const storageService = getStorageService();

      // Generate download URL for the original
      const originalUrl = await storageService.generateDownloadUrl(
        asset.original_key
      );

      // Fetch the original image
      const response = await fetch(originalUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch original image");
      }

      let imageBuffer: Buffer | null = Buffer.from(await response.arrayBuffer());

      // Extract EXIF first (reads header bytes only, very fast) before Sharp processing
      let metadataUpdate: Record<string, unknown> = {};
      if (supportsMetadataExtraction(asset.media_type)) {
        try {
          const metadata = await extractMetadata(imageBuffer);
          metadataUpdate = {
            date_taken: metadata.dateTaken?.toISOString() ?? null,
            latitude: metadata.latitude,
            longitude: metadata.longitude,
            altitude: metadata.altitude,
            camera_make: metadata.cameraMake,
            camera_model: metadata.cameraModel,
            lens_model: metadata.lensModel,
            iso: metadata.iso,
            f_number: metadata.fNumber,
            exposure_time: metadata.exposureTime,
            focal_length: metadata.focalLength,
            orientation: metadata.orientation,
            location_country: metadata.locationCountry,
            location_state: metadata.locationState,
            location_city: metadata.locationCity,
          };
        } catch (metadataError) {
          console.error("Failed to extract metadata:", metadataError);
        }
      }

      // Generate thumbnail using sharp (dynamic import for edge compatibility)
      // Reuse a single Sharp instance and clone for HEIC web version to cut peak memory
      const sharp = (await import("sharp")).default;
      const isHeic = asset.mime_type === "image/heic" || asset.mime_type === "image/heif";

      // .rotate() with no args reads the EXIF Orientation tag and physically
      // rotates the pixels, then strips the tag so all derived buffers
      // (thumbnail, HEIC web version) are upright without viewer-side correction.
      const sharpInstance = sharp(imageBuffer).rotate();

      // Generate thumbnail from clone
      const thumbnailBuffer = await sharpInstance
        .clone()
        .resize(400, 400, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Derive thumbnail and web keys from the date prefix in original_key.
      // New key scheme: media/{groupId}/{YYYY}/{MM}/{assetId}-{filename}
      const [, , thumbYear, thumbMonth] = asset.original_key.split("/");
      const thumbnailKey = `thumbs/${asset.group_id}/${thumbYear}/${thumbMonth}/${assetId}.jpg`;

      const { url: uploadUrl } = await storageService.generateUploadUrl(
        thumbnailKey,
        {
          contentType: "image/jpeg",
          contentLength: thumbnailBuffer.length,
        }
      );

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: new Uint8Array(thumbnailBuffer),
        headers: { "Content-Type": "image/jpeg" },
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload thumbnail");
      }

      // For HEIC/HEIF: generate a web-compatible JPEG version from the same Sharp instance
      if (isHeic) {
        const webBuffer = await sharpInstance
          .clone()
          .jpeg({ quality: 90 })
          .toBuffer();

        const webKey = `web/${asset.group_id}/${thumbYear}/${thumbMonth}/${assetId}.jpg`;

        const { url: webUploadUrl } = await storageService.generateUploadUrl(
          webKey,
          {
            contentType: "image/jpeg",
            contentLength: webBuffer.length,
          }
        );

        const webUploadResponse = await fetch(webUploadUrl, {
          method: "PUT",
          body: new Uint8Array(webBuffer),
          headers: { "Content-Type": "image/jpeg" },
        });

        if (!webUploadResponse.ok) {
          console.error("Failed to upload web-optimized version");
        }
      }

      // Release buffer reference so GC can reclaim during DB update
      imageBuffer = null;

      // Update asset with thumbnail key, metadata, and ready status
      await supabase
        .from("media_assets")
        .update({
          thumbnail_key: thumbnailKey,
          status: "ready",
          ...metadataUpdate,
        })
        .eq("id", assetId);

      // Enqueue face detection job (picked up by Python worker)
      await supabase.from("face_jobs").insert({
        media_asset_id: assetId,
        group_id: asset.group_id,
      });

      return NextResponse.json({ success: true, thumbnail: true });
    } catch (processingError) {
      console.error("Thumbnail processing error:", processingError);

      // Mark as ready even if thumbnail failed
      await supabase
        .from("media_assets")
        .update({ status: "ready" })
        .eq("id", assetId);

      // Enqueue face detection job even if thumbnail failed
      await supabase.from("face_jobs").insert({
        media_asset_id: assetId,
        group_id: asset.group_id,
      });

      return NextResponse.json({ success: true, thumbnail: false });
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
