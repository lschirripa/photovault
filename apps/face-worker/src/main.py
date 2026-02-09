"""Face worker entry point: polls for jobs, detects faces, clusters them."""

import logging
import time
from dataclasses import dataclass, field

from dotenv import load_dotenv
load_dotenv()  # Load .env file before importing config

from .config import POLL_INTERVAL_SECONDS, BATCH_SIZE
from .detector import load_model, detect_faces, image_from_bytes
from .clustering import assign_to_person
from .storage import (
    claim_jobs,
    complete_job,
    fail_job,
    get_asset,
    get_queue_stats,
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

SUMMARY_INTERVAL_SECONDS = 30  # log lifetime summary every N seconds


@dataclass
class WorkerStats:
    """Tracks cumulative and per-batch worker metrics."""

    started_at: float = field(default_factory=time.monotonic)

    # Lifetime counters
    total_jobs_completed: int = 0
    total_jobs_failed: int = 0
    total_faces_detected: int = 0
    total_persons_created: int = 0
    total_persons_matched: int = 0
    total_batches: int = 0
    total_idle_polls: int = 0

    # Lifetime timing (seconds)
    total_download_time: float = 0.0
    total_detect_time: float = 0.0
    total_cluster_time: float = 0.0
    total_job_time: float = 0.0

    # Last summary timestamp
    _last_summary_at: float = 0.0

    def uptime(self) -> float:
        return time.monotonic() - self.started_at

    def log_batch_summary(
        self,
        batch_size: int,
        batch_completed: int,
        batch_failed: int,
        batch_faces: int,
        batch_new_persons: int,
        batch_matched: int,
        batch_elapsed: float,
    ) -> None:
        self.total_batches += 1
        rate = batch_completed / batch_elapsed if batch_elapsed > 0 else 0
        avg_job = batch_elapsed / batch_size if batch_size > 0 else 0
        avg_faces = batch_faces / batch_completed if batch_completed > 0 else 0

        logger.info(
            "--- Batch #%d done: %d/%d ok, %d failed | "
            "%d faces (%.1f/job), %d new persons, %d matched | "
            "%.1fs elapsed (%.2f jobs/s, %.2fs avg/job)",
            self.total_batches,
            batch_completed, batch_size, batch_failed,
            batch_faces, avg_faces, batch_new_persons, batch_matched,
            batch_elapsed, rate, avg_job,
        )

    def log_queue_depth(self) -> None:
        try:
            q = get_queue_stats()
            logger.info(
                "--- Queue: %d pending, %d in_progress, %d completed, %d failed (total in DB)",
                q["pending"], q["in_progress"], q["completed"], q["failed"],
            )
        except Exception:
            logger.debug("Could not fetch queue stats", exc_info=True)

    def maybe_log_lifetime_summary(self) -> None:
        now = time.monotonic()
        if now - self._last_summary_at < SUMMARY_INTERVAL_SECONDS:
            return
        self._last_summary_at = now
        total = self.total_jobs_completed + self.total_jobs_failed
        uptime = self.uptime()
        throughput = self.total_jobs_completed / uptime if uptime > 0 else 0
        avg_job = self.total_job_time / self.total_jobs_completed if self.total_jobs_completed > 0 else 0
        avg_dl = self.total_download_time / self.total_jobs_completed if self.total_jobs_completed > 0 else 0
        avg_det = self.total_detect_time / self.total_jobs_completed if self.total_jobs_completed > 0 else 0
        avg_clust = self.total_cluster_time / self.total_faces_detected if self.total_faces_detected > 0 else 0

        logger.info(
            "=== Lifetime: %d jobs (%d ok, %d failed) | %d faces (%d new persons, %d matched) | "
            "uptime %.0fs, %.2f jobs/s overall",
            total, self.total_jobs_completed, self.total_jobs_failed,
            self.total_faces_detected, self.total_persons_created, self.total_persons_matched,
            uptime, throughput,
        )
        if self.total_jobs_completed > 0:
            logger.info(
                "=== Avg timing: %.2fs/job total (download %.2fs, detect %.2fs, cluster %.2fs/face) | "
                "%d idle polls, %d batches",
                avg_job, avg_dl, avg_det, avg_clust,
                self.total_idle_polls, self.total_batches,
            )


@dataclass
class JobResult:
    """Result data from processing a single job."""
    faces_detected: int = 0
    persons_created: int = 0
    persons_matched: int = 0
    download_time: float = 0.0
    detect_time: float = 0.0
    cluster_time: float = 0.0


def process_job(model, job: dict) -> JobResult:
    """Process a single face detection job. Returns timing and face stats."""
    result = JobResult()
    asset_id = job["media_asset_id"]
    group_id = job["group_id"]

    # 1. Fetch asset metadata to get the R2 key
    asset = get_asset(asset_id)
    if not asset:
        raise ValueError(f"Asset {asset_id} not found")

    original_key = asset["original_key"]
    logger.info("Processing asset %s (key=%s)", asset_id, original_key)

    # 2. Download image from R2
    t0 = time.monotonic()
    image_bytes = download_image(original_key)
    image_bgr = image_from_bytes(image_bytes)
    result.download_time = time.monotonic() - t0
    img_h, img_w = image_bgr.shape[:2]
    size_kb = len(image_bytes) / 1024

    # 3. Detect faces
    t0 = time.monotonic()
    faces = detect_faces(model, image_bgr)
    result.detect_time = time.monotonic() - t0
    result.faces_detected = len(faces)

    logger.info(
        "Detected %d face(s) in asset %s (%dx%d, %.0f KB, download %.2fs, detect %.2fs)",
        len(faces), asset_id, img_w, img_h, size_kb,
        result.download_time, result.detect_time,
    )

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
        t0 = time.monotonic()
        person_id, is_new = assign_to_person(group_id, embedding_list)
        result.cluster_time += time.monotonic() - t0

        if is_new:
            result.persons_created += 1
        else:
            result.persons_matched += 1

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

    return result


def main() -> None:
    logger.info("Loading InsightFace model...")
    model = load_model()
    logger.info(
        "Model loaded. Starting poll loop (interval=%ds, batch_size=%d).",
        POLL_INTERVAL_SECONDS, BATCH_SIZE,
    )

    stats = WorkerStats()

    while True:
        jobs = claim_jobs()

        if not jobs:
            stats.total_idle_polls += 1
            stats.maybe_log_lifetime_summary()
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        logger.info("Claimed %d job(s)", len(jobs))

        batch_start = time.monotonic()
        batch_completed = 0
        batch_failed = 0
        batch_faces = 0
        batch_new_persons = 0
        batch_matched = 0

        for job in jobs:
            job_id = job["id"]
            job_start = time.monotonic()
            try:
                jr = process_job(model, job)
                complete_job(job_id)
                job_elapsed = time.monotonic() - job_start

                batch_completed += 1
                batch_faces += jr.faces_detected
                batch_new_persons += jr.persons_created
                batch_matched += jr.persons_matched

                stats.total_jobs_completed += 1
                stats.total_faces_detected += jr.faces_detected
                stats.total_persons_created += jr.persons_created
                stats.total_persons_matched += jr.persons_matched
                stats.total_download_time += jr.download_time
                stats.total_detect_time += jr.detect_time
                stats.total_cluster_time += jr.cluster_time
                stats.total_job_time += job_elapsed

                logger.info(
                    "Job %s completed in %.2fs (%d faces, download %.2fs, detect %.2fs, cluster %.2fs)",
                    job_id, job_elapsed, jr.faces_detected,
                    jr.download_time, jr.detect_time, jr.cluster_time,
                )
            except Exception as exc:
                logger.exception("Job %s failed", job_id)
                fail_job(job_id, str(exc))
                batch_failed += 1
                stats.total_jobs_failed += 1

        batch_elapsed = time.monotonic() - batch_start

        stats.log_batch_summary(
            batch_size=len(jobs),
            batch_completed=batch_completed,
            batch_failed=batch_failed,
            batch_faces=batch_faces,
            batch_new_persons=batch_new_persons,
            batch_matched=batch_matched,
            batch_elapsed=batch_elapsed,
        )
        stats.log_queue_depth()
        stats.maybe_log_lifetime_summary()

    # Note: the loop never exits naturally.
    # Use SIGTERM / SIGINT (Docker stop) to shut down.


if __name__ == "__main__":
    main()
