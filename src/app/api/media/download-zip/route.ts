import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import archiver from "archiver";
import { Readable } from "stream";
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

    const body = await request.json();
    const { assetIds } = body as { assetIds: string[] };

    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid assetIds" },
        { status: 400 }
      );
    }

    if (assetIds.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 files per download" },
        { status: 400 }
      );
    }

    // Get all assets and verify user has access
    const { data: assets, error: assetsError } = (await supabase
      .from("media_assets")
      .select("*, groups!inner(id)")
      .in("id", assetIds)) as unknown as {
      data: (Tables<"media_assets"> & { groups: { id: string } })[] | null;
      error: Error | null;
    };

    if (assetsError || !assets || assets.length === 0) {
      return NextResponse.json({ error: "Assets not found" }, { status: 404 });
    }

    const storageService = getStorageService();

    // Create a streaming response with archiver
    const archive = archiver("zip", { zlib: { level: 5 } });

    // Track used filenames to avoid duplicates
    const usedFilenames = new Map<string, number>();

    const getUniqueFilename = (filename: string): string => {
      const count = usedFilenames.get(filename) || 0;
      usedFilenames.set(filename, count + 1);

      if (count === 0) return filename;

      const ext = filename.lastIndexOf(".");
      if (ext > 0) {
        return `${filename.slice(0, ext)}_${count}${filename.slice(ext)}`;
      }
      return `${filename}_${count}`;
    };

    // Add files to the archive, streaming each one
    for (const asset of assets) {
      try {
        const downloadUrl = await storageService.generateDownloadUrl(
          asset.original_key,
          3600
        );

        const response = await fetch(downloadUrl);
        if (response.ok && response.body) {
          const uniqueFilename = getUniqueFilename(asset.filename);
          const nodeStream = Readable.fromWeb(response.body as import("stream/web").ReadableStream);
          archive.append(nodeStream, { name: uniqueFilename });
        }
      } catch (err) {
        console.error(`Failed to fetch asset ${asset.id}:`, err);
        // Continue with other files
      }
    }

    // Finalize the archive
    archive.finalize();

    // Stream archive output to client via Web ReadableStream
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `photovault_${timestamp}.zip`;

    const webStream = new ReadableStream({
      start(controller) {
        archive.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        archive.on("end", () => {
          controller.close();
        });
        archive.on("error", (err) => {
          controller.error(err);
        });
      },
    });

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Download zip error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
