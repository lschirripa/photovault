import exifr from "exifr";
import { reverseGeocode } from "./reverse-geocoding-service";

export interface ExtractedMetadata {
  dateTaken: Date | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  iso: number | null;
  fNumber: number | null;
  exposureTime: string | null;
  focalLength: number | null;
  orientation: number | null;
  locationCountry: string | null;
  locationState: string | null;
  locationCity: string | null;
}

/**
 * Formats exposure time as a human-readable fraction string
 * e.g., 0.004 -> "1/250", 0.5 -> "1/2", 2 -> "2"
 */
function formatExposureTime(value: number | undefined): string | null {
  if (value === undefined || value === null) return null;

  if (value >= 1) {
    return String(value);
  }

  // Convert to fraction
  const denominator = Math.round(1 / value);
  return `1/${denominator}`;
}

/**
 * Extracts EXIF metadata from an image buffer
 * @param buffer - The image file buffer
 * @returns Extracted metadata or empty metadata object if extraction fails
 */
export async function extractMetadata(
  buffer: ArrayBuffer | Buffer
): Promise<ExtractedMetadata> {
  const emptyMetadata: ExtractedMetadata = {
    dateTaken: null,
    latitude: null,
    longitude: null,
    altitude: null,
    cameraMake: null,
    cameraModel: null,
    lensModel: null,
    iso: null,
    fNumber: null,
    exposureTime: null,
    focalLength: null,
    orientation: null,
    locationCountry: null,
    locationState: null,
    locationCity: null,
  };

  try {
    // Parse EXIF data with specific tags we care about
    const exif = await exifr.parse(buffer, {
      // Core EXIF tags
      pick: [
        "DateTimeOriginal",
        "CreateDate",
        "ModifyDate",
        "GPSLatitude",
        "GPSLatitudeRef",
        "GPSLongitude",
        "GPSLongitudeRef",
        "GPSAltitude",
        "GPSAltitudeRef",
        "Make",
        "Model",
        "LensModel",
        "LensMake",
        "ISO",
        "FNumber",
        "ExposureTime",
        "FocalLength",
        "Orientation",
      ],
      // Enable GPS parsing
      gps: true,
    });

    if (!exif) {
      return emptyMetadata;
    }

    // Extract date taken (prefer DateTimeOriginal, fallback to CreateDate)
    let dateTaken: Date | null = null;
    if (exif.DateTimeOriginal instanceof Date) {
      dateTaken = exif.DateTimeOriginal;
    } else if (exif.CreateDate instanceof Date) {
      dateTaken = exif.CreateDate;
    }

    // Extract GPS coordinates
    // exifr automatically converts GPS data to decimal degrees when gps: true
    const latitude =
      typeof exif.latitude === "number" ? exif.latitude : null;
    const longitude =
      typeof exif.longitude === "number" ? exif.longitude : null;
    const altitude =
      typeof exif.GPSAltitude === "number" ? exif.GPSAltitude : null;

    // Extract camera info
    const cameraMake =
      typeof exif.Make === "string" ? exif.Make.trim() : null;
    const cameraModel =
      typeof exif.Model === "string" ? exif.Model.trim() : null;

    // Extract lens info (try LensModel first, then combine LensMake)
    let lensModel: string | null = null;
    if (typeof exif.LensModel === "string") {
      lensModel = exif.LensModel.trim();
    }

    // Extract exposure settings
    const iso = typeof exif.ISO === "number" ? exif.ISO : null;
    const fNumber =
      typeof exif.FNumber === "number" ? exif.FNumber : null;
    const exposureTime = formatExposureTime(exif.ExposureTime);
    const focalLength =
      typeof exif.FocalLength === "number" ? exif.FocalLength : null;

    // Extract orientation
    const orientation =
      typeof exif.Orientation === "number" ? exif.Orientation : null;

    // Reverse geocode GPS coordinates to place names
    let locationCountry: string | null = null;
    let locationState: string | null = null;
    let locationCity: string | null = null;
    if (latitude !== null && longitude !== null) {
      const geo = await reverseGeocode(latitude, longitude);
      if (geo) {
        locationCountry = geo.country;
        locationState = geo.state;
        locationCity = geo.city;
      }
    }

    return {
      dateTaken,
      latitude,
      longitude,
      altitude,
      cameraMake,
      cameraModel,
      lensModel,
      iso,
      fNumber,
      exposureTime,
      focalLength,
      orientation,
      locationCountry,
      locationState,
      locationCity,
    };
  } catch (error) {
    console.error("Failed to extract EXIF metadata:", error);
    return emptyMetadata;
  }
}

/**
 * Checks if a media type supports EXIF extraction
 */
export function supportsMetadataExtraction(mediaType: string): boolean {
  return mediaType === "image";
}
