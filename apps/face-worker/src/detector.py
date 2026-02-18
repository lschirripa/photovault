"""InsightFace wrapper for face detection and embedding generation."""

import os

os.environ.setdefault("MPLBACKEND", "Agg")  # prevent matplotlib font scan on macOS

from dataclasses import dataclass

import cv2
import numpy as np
from insightface.app import FaceAnalysis

from .config import INSIGHTFACE_MODEL, MIN_FACE_CONFIDENCE, MIN_FACE_SIZE_PX, MIN_FACE_AREA_RATIO, MIN_BLUR_SCORE


@dataclass
class DetectedFace:
    """A single detected face with its embedding and bounding box."""

    embedding: np.ndarray           # 512-dim normalized vector
    bbox: tuple[int, int, int, int] # (x1, y1, x2, y2) in pixel coords
    confidence: float               # 0.0–1.0


def load_model() -> FaceAnalysis:
    """Load InsightFace model. Call once at startup, reuse the instance."""
    app = FaceAnalysis(name=INSIGHTFACE_MODEL, providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app


def detect_faces(model: FaceAnalysis, image_bgr: np.ndarray) -> list[DetectedFace]:
    """Detect all faces in an image and return embeddings + bounding boxes.

    Args:
        model: Loaded FaceAnalysis instance.
        image_bgr: Image in BGR format (as returned by cv2.imread).

    Returns:
        List of DetectedFace, filtered by MIN_FACE_CONFIDENCE.
    """
    faces = model.get(image_bgr)

    h, w = image_bgr.shape[:2]
    img_area = h * w

    results: list[DetectedFace] = []
    for face in faces:
        score = float(face.det_score)
        if score < MIN_FACE_CONFIDENCE:
            continue

        bbox = face.bbox.astype(int)
        x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])

        # Clamp to image bounds
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)

        face_w = x2 - x1
        face_h = y2 - y1

        # Reject faces that are too small in pixel terms (background crowd)
        if face_w < MIN_FACE_SIZE_PX or face_h < MIN_FACE_SIZE_PX:
            continue

        # Reject faces that are a tiny fraction of the image area
        if (face_w * face_h) / img_area < MIN_FACE_AREA_RATIO:
            continue

        # Reject blurry faces via Laplacian variance on the crop region
        crop_gray = cv2.cvtColor(image_bgr[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)
        blur_score = cv2.Laplacian(crop_gray, cv2.CV_64F).var()
        if blur_score < MIN_BLUR_SCORE:
            continue

        results.append(
            DetectedFace(
                embedding=face.normed_embedding,  # already L2-normalized
                bbox=(x1, y1, x2, y2),
                confidence=score,
            )
        )

    return results


def image_from_bytes(data: bytes) -> np.ndarray:
    """Decode raw image bytes into a BGR numpy array for OpenCV/InsightFace."""
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image")
    return img
