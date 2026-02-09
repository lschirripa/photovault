const HEIC_EXTENSIONS = new Set(["heic", "heif"]);

export async function downloadDriveFile(
  fileId: string,
  fileName: string,
  mimeType: string,
  accessToken: string
): Promise<File> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (response.status === 401) {
    throw new TokenExpiredError();
  }

  if (!response.ok) {
    throw new Error(`Failed to download "${fileName}" (HTTP ${response.status})`);
  }

  const blob = await response.blob();

  // Infer MIME type from extension if missing (e.g. HEIC from iOS)
  let resolvedType = mimeType;
  if (!resolvedType) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext && HEIC_EXTENSIONS.has(ext)) {
      resolvedType = `image/${ext}`;
    }
  }

  return new File([blob], fileName, { type: resolvedType });
}

export class TokenExpiredError extends Error {
  constructor() {
    super("Google access token expired");
    this.name = "TokenExpiredError";
  }
}
