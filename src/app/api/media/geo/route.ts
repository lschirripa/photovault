import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { GEO_DEFAULT_LIMIT, GEO_MAX_LIMIT } from "@/infrastructure/config/limits";
import { getStandardLimiter } from "@/infrastructure/redis/rate-limit";
import { checkRateLimit } from "@/infrastructure/redis/with-rate-limit";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit
    const rateLimited = await checkRateLimit(getStandardLimiter(), user.id);
    if (rateLimited) return rateLimited;

    // Parse pagination params
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor"); // ISO timestamp
    const limitParam = parseInt(searchParams.get("limit") || "", 10);
    const limit = Math.min(
      Number.isFinite(limitParam) && limitParam > 0 ? limitParam : GEO_DEFAULT_LIMIT,
      GEO_MAX_LIMIT
    );

    // Parse optional viewport bounds: swLat,swLng,neLat,neLng
    const boundsParam = searchParams.get("bounds");
    let bounds: { swLat: number; swLng: number; neLat: number; neLng: number } | null = null;
    if (boundsParam) {
      const parts = boundsParam.split(",").map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        bounds = { swLat: parts[0], swLng: parts[1], neLat: parts[2], neLng: parts[3] };
      }
    }

    // Build query — fetch limit+1 to detect hasMore
    let query = supabase
      .from("media_assets")
      .select(
        "id, group_id, latitude, longitude, thumbnail_key, filename, location_country, location_city, created_at, groups!media_assets_group_id_fkey!inner(name)"
      )
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    if (bounds) {
      query = query
        .gte("latitude", bounds.swLat)
        .lte("latitude", bounds.neLat)
        .gte("longitude", bounds.swLng)
        .lte("longitude", bounds.neLng);
    }

    const { data, error } = (await query) as unknown as {
      data:
        | Array<{
            id: string;
            group_id: string;
            latitude: number;
            longitude: number;
            thumbnail_key: string | null;
            filename: string;
            location_country: string | null;
            location_city: string | null;
            created_at: string;
            groups: { name: string };
          }>
        | null;
      error: Error | null;
    };

    if (error) {
      console.error("Error fetching geo media:", error);
      return NextResponse.json(
        { error: "Failed to fetch geo media" },
        { status: 500 }
      );
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const points = pageRows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      groupName: row.groups.name,
      lat: row.latitude,
      lng: row.longitude,
      thumbnailKey: row.thumbnail_key ?? "",
      filename: row.filename,
      locationCountry: row.location_country ?? undefined,
      locationCity: row.location_city ?? undefined,
    }));

    const nextCursor = hasMore ? pageRows[pageRows.length - 1].created_at : null;

    return NextResponse.json({ points, nextCursor, hasMore });
  } catch (error) {
    console.error("Error in geo media endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
