import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = (await supabase
      .from("media_assets")
      .select(
        "id, group_id, latitude, longitude, thumbnail_key, filename, location_country, location_city, groups!media_assets_group_id_fkey!inner(name)"
      )
      .not("latitude", "is", null)
      .not("longitude", "is", null)) as unknown as {
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

    const points = (data ?? []).map((row) => ({
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

    return NextResponse.json({ points }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    console.error("Error in geo media endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
