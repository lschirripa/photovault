"""Face worker entry point: polls for jobs, detects faces, clusters them."""

import logging
import time

from dotenv import load_dotenv
load_dotenv()  # Load .env file before importing config

from .config import POLL_INTERVAL_SECONDS
from .detector import load_model, detect_faces, image_from_bytes
from .clustering import assign_to_person
from .storage import (
    claim_jobs,
    complete_job,
    fail_job,
    get_asset,
    download_image,
    upload_face_crop,
    insert_detected_face,
    update_representative_face,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def process_job(model, job: dict) -> None:
    """Process a single face detection job."""
    asset_id = job["media_asset_id"]
    group_id = job["group_id"]

    # 1. Fetch asset metadata to get the R2 key
    asset = get_asset(asset_id)
    if not asset:
        raise ValueError(f"Asset {asset_id} not found")

    original_key = asset["original_key"]
    logger.info("Processing asset %s (key=%s)", asset_id, original_key)

    # 2. Download image from R2
    image_bytes = download_image(original_key)
    image_bgr = image_from_bytes(image_bytes)
    img_h, img_w = image_bgr.shape[:2]

    # 3. Detect faces
    faces = detect_faces(model, image_bgr)
    logger.info("Detected %d face(s) in asset %s", len(faces), asset_id)

    # 4. Process each face
    for face in faces:
        embedding_list = face.embedding.tolist()
        x1, y1, x2, y2 = face.bbox

        # Normalize bbox to 0.0-1.0
        bbox_x = x1 / img_w
        bbox_y = y1 / img_h
        bbox_w = (x2 - x1) / img_w
        bbox_h = (y2 - y1) / img_h

        # Upload face crop to R2
        face_crop_key = upload_face_crop(image_bgr, face.bbox)

        # Assign to nearest person or create new
        person_id, is_new = assign_to_person(group_id, embedding_list)

        # Insert detected face record
        face_id = insert_detected_face(
            media_asset_id=asset_id,
            person_id=person_id,
            embedding=embedding_list,
            bbox_x=bbox_x,
            bbox_y=bbox_y,
            bbox_w=bbox_w,
            bbox_h=bbox_h,
            confidence=face.confidence,
            face_crop_key=face_crop_key,
        )

        # Update representative face (highest confidence crop)
        update_representative_face(person_id, face_id, face.confidence)

        logger.info(
            "  Face %s -> person %s (%s, conf=%.3f)",
            face_id, person_id, "new" if is_new else "matched", face.confidence,
        )


def main() -> None:
    logger.info("Loading InsightFace model...")
    model = load_model()
    logger.info("Model loaded. Starting poll loop (interval=%ds).", POLL_INTERVAL_SECONDS)

    while True:
        jobs = claim_jobs()

        if not jobs:
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        logger.info("Claimed %d job(s)", len(jobs))

        for job in jobs:
            job_id = job["id"]
            try:
                process_job(model, job)
                complete_job(job_id)
                logger.info("Job %s completed", job_id)
            except Exception as exc:
                logger.exception("Job %s failed", job_id)
                fail_job(job_id, str(exc))

    # Note: the loop never exits naturally.
    # Use SIGTERM / SIGINT (Docker stop) to shut down.


if __name__ == "__main__":
    main()
