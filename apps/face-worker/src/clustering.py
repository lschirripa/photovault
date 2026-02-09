"""Incremental nearest-neighbor face clustering via pgvector."""

import logging

from .config import COSINE_DISTANCE_THRESHOLD
from .storage import get_supabase, create_person, update_person_centroid

logger = logging.getLogger(__name__)


def assign_to_person(
    group_id: str,
    embedding: list[float],
    threshold: float = COSINE_DISTANCE_THRESHOLD,
) -> tuple[str, bool]:
    """Find the nearest person cluster or create a new one.

    Args:
        group_id: The group this face belongs to.
        embedding: 512-dim normalized face embedding.
        threshold: Maximum cosine distance to consider a match.

    Returns:
        Tuple of (person_id, is_new_person).
    """
    sb = get_supabase()
    result = sb.rpc("find_nearest_person", {
        "p_group_id": group_id,
        "p_embedding": embedding,
    }).execute()

    if result.data and len(result.data) > 0:
        nearest = result.data[0]
        distance = nearest["distance"]

        if distance < threshold:
            person_id = nearest["id"]
            face_count = nearest["face_count"]
            logger.debug(
                "Matched person %s (distance=%.4f, faces=%d)",
                person_id, distance, face_count,
            )
            update_person_centroid(person_id, embedding, face_count)
            return person_id, False

    # No match found — create a new unnamed person
    person_id = create_person(group_id, embedding)
    logger.info("Created new person %s in group %s", person_id, group_id)
    return person_id, True
