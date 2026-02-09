"""R2 storage and Supabase database operations for the face worker."""

import io
import uuid
from typing import Any

import boto3
import cv2
import numpy as np
from PIL import Image
from supabase import create_client, Client

from .config import (
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    R2_ENDPOINT_URL,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
    BATCH_SIZE,
    FACE_CROP_SIZE,
    FACE_CROP_PADDING,
    FACE_CROP_JPEG_QUALITY,
)

# --- Singletons ---

_supabase: Client | None = None
_s3_client = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _supabase


def get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT_URL,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
    return _s3_client


# --- R2 Operations ---


def download_image(original_key: str) -> bytes:
    """Download an image from R2 by its storage key."""
    s3 = get_s3()
    response = s3.get_object(Bucket=R2_BUCKET_NAME, Key=original_key)
    return response["Body"].read()


def upload_face_crop(
    image_bgr: np.ndarray,
    bbox: tuple[int, int, int, int],
) -> str:
    """Crop a face from the image, resize, upload to R2, return the key.

    Args:
        image_bgr: Full image in BGR format.
        bbox: (x1, y1, x2, y2) pixel coordinates.

    Returns:
        R2 key for the uploaded face crop.
    """
    x1, y1, x2, y2 = bbox
    h, w = image_bgr.shape[:2]

    # Add padding around the face
    face_w = x2 - x1
    face_h = y2 - y1
    pad_x = int(face_w * FACE_CROP_PADDING)
    pad_y = int(face_h * FACE_CROP_PADDING)

    cx1 = max(0, x1 - pad_x)
    cy1 = max(0, y1 - pad_y)
    cx2 = min(w, x2 + pad_x)
    cy2 = min(h, y2 + pad_y)

    crop = image_bgr[cy1:cy2, cx1:cx2]

    # Convert BGR -> RGB for PIL
    crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(crop_rgb)
    pil_img = pil_img.resize((FACE_CROP_SIZE, FACE_CROP_SIZE), Image.LANCZOS)

    # Encode as JPEG
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=FACE_CROP_JPEG_QUALITY)
    buf.seek(0)
    jpeg_bytes = buf.getvalue()

    # Upload to R2
    face_id = str(uuid.uuid4())
    key = f"faces/{face_id}.jpg"

    s3 = get_s3()
    s3.put_object(
        Bucket=R2_BUCKET_NAME,
        Key=key,
        Body=jpeg_bytes,
        ContentType="image/jpeg",
    )

    return key


# --- Supabase Job Operations ---


def claim_jobs() -> list[dict[str, Any]]:
    """Atomically claim a batch of pending face jobs."""
    sb = get_supabase()
    result = sb.rpc("claim_face_jobs", {"batch_size": BATCH_SIZE}).execute()
    return result.data or []


def get_queue_stats() -> dict[str, int]:
    """Return counts of face_jobs by status."""
    sb = get_supabase()
    counts: dict[str, int] = {"pending": 0, "in_progress": 0, "completed": 0, "failed": 0}
    for status in counts:
        result = (
            sb.table("face_jobs")
            .select("id", count="exact")
            .eq("status", status)
            .execute()
        )
        counts[status] = result.count or 0
    return counts


def complete_job(job_id: str) -> None:
    """Mark a job as completed."""
    sb = get_supabase()
    sb.table("face_jobs").update({
        "status": "completed",
        "completed_at": "now()",
    }).eq("id", job_id).execute()


def fail_job(job_id: str, error: str) -> None:
    """Mark a job as failed with an error message."""
    sb = get_supabase()
    sb.table("face_jobs").update({
        "status": "failed",
        "error": error[:500],  # truncate long errors
    }).eq("id", job_id).execute()


# --- Supabase Face/Person Operations ---


def get_asset(asset_id: str) -> dict[str, Any] | None:
    """Fetch a media asset by ID."""
    sb = get_supabase()
    result = sb.table("media_assets").select("*").eq("id", asset_id).single().execute()
    return result.data


def insert_detected_face(
    media_asset_id: str,
    person_id: str,
    embedding: list[float],
    bbox_x: float,
    bbox_y: float,
    bbox_w: float,
    bbox_h: float,
    confidence: float,
    face_crop_key: str,
) -> str:
    """Insert a detected face row and return its ID."""
    sb = get_supabase()
    result = sb.table("detected_faces").insert({
        "media_asset_id": media_asset_id,
        "person_id": person_id,
        "embedding": embedding,
        "bbox_x": bbox_x,
        "bbox_y": bbox_y,
        "bbox_w": bbox_w,
        "bbox_h": bbox_h,
        "confidence": confidence,
        "face_crop_key": face_crop_key,
    }).execute()
    return result.data[0]["id"]


def create_person(group_id: str, embedding: list[float]) -> str:
    """Create a new unnamed person with the given embedding as initial centroid."""
    sb = get_supabase()
    result = sb.table("persons").insert({
        "group_id": group_id,
        "centroid": embedding,
        "face_count": 1,
    }).execute()
    return result.data[0]["id"]


def update_person_centroid(
    person_id: str,
    new_embedding: list[float],
    current_face_count: int,
) -> None:
    """Update a person's centroid using running weighted average.

    new_centroid = (old_centroid * count + new_embedding) / (count + 1)
    This is done in Python because pgvector doesn't support vector arithmetic in UPDATE SET.
    """
    sb = get_supabase()

    # Fetch current centroid
    result = sb.table("persons").select("centroid").eq("id", person_id).single().execute()
    old_centroid_str: str = result.data["centroid"]

    # Parse pgvector string format "[0.1,0.2,...]" into list of floats
    old_centroid = _parse_pgvector(old_centroid_str)

    # Weighted average
    n = current_face_count
    new_centroid = [
        (old * n + new) / (n + 1)
        for old, new in zip(old_centroid, new_embedding)
    ]

    # Normalize to unit length (cosine distance expects normalized vectors)
    norm = sum(x * x for x in new_centroid) ** 0.5
    if norm > 0:
        new_centroid = [x / norm for x in new_centroid]

    sb.table("persons").update({
        "centroid": new_centroid,
        "face_count": n + 1,
    }).eq("id", person_id).execute()


def update_representative_face(person_id: str, face_id: str, confidence: float) -> None:
    """Update the representative face if this face has higher confidence."""
    sb = get_supabase()
    # Only update if no representative is set, or this one has higher confidence
    current = sb.table("persons").select("representative_face_id").eq("id", person_id).single().execute()
    if current.data["representative_face_id"] is None:
        sb.table("persons").update({"representative_face_id": face_id}).eq("id", person_id).execute()
        return

    # Check if current representative has lower confidence
    current_face = (
        sb.table("detected_faces")
        .select("confidence")
        .eq("id", current.data["representative_face_id"])
        .single()
        .execute()
    )
    if current_face.data and confidence > current_face.data["confidence"]:
        sb.table("persons").update({"representative_face_id": face_id}).eq("id", person_id).execute()


def _parse_pgvector(vec_str: str) -> list[float]:
    """Parse a pgvector string like '[0.1,0.2,...]' into a list of floats."""
    cleaned = vec_str.strip("[]")
    return [float(x) for x in cleaned.split(",")]
