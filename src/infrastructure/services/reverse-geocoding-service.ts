export interface GeocodingResult {
  country: string;
  state: string | null;
  city: string | null;
}

/**
 * Reverse geocodes lat/lon to human-readable country/state/city
 * using the OpenStreetMap Nominatim API.
 * Best-effort: returns null on any failure.
 */
export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<GeocodingResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "PhotoVault/1.0",
        "Accept-Language": "en",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const address = data?.address;
    if (!address?.country) return null;

    return {
      country: address.country,
      state: address.state ?? null,
      city: address.city ?? address.town ?? address.village ?? null,
    };
  } catch {
    return null;
  }
}
