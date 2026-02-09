import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import {
  extractMetadata,
  supportsMetadataExtraction,
} from "@/infrastructure/services/metadata-extraction-service";
import type { Tables } from "@/types/supabase";

export async function POST(request: NextRequest) {
  try {
    const { assetId } = await request.json();

    if (!assetId) {
      return NextResponse.json({ error: "Missing assetId" }, { status: 400 });
    }

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

      const imageBuffer = Buffer.from(await response.arrayBuffer());

      // Generate thumbnail using sharp (dynamic import for edge compatibility)
      const sharp = (await import("sharp")).default;
      const thumbnailBuffer = await sharp(imageBuffer)
        .resize(400, 400, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Upload thumbnail - replace extension with .jpg
      const thumbnailKey = asset.original_key.replace(
        /\/([^/]+)\.[^.]+$/,
        "/thumb_$1.jpg"
      );

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

      // For HEIC/HEIF: generate a web-compatible JPEG version at full resolution
      const isHeic = asset.mime_type === "image/heic" || asset.mime_type === "image/heif";
      if (isHeic) {
        const webBuffer = await sharp(imageBuffer)
          .jpeg({ quality: 90 })
          .toBuffer();

        const webKey = asset.original_key.replace(
          /\/([^/]+)\.[^.]+$/,
          "/web_$1.jpg"
        );

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

      // Extract EXIF metadata from the image buffer
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
