# Face Worker

Python microservice that detects faces in uploaded photos and clusters them by identity.

## Architecture
- Polls `face_jobs` table in Supabase for pending work
- Downloads original images from Cloudflare R2
- Uses InsightFace (buffalo_l, ONNX/CPU) for face detection + 512-dim embedding generation
- Clusters faces incrementally via pgvector cosine nearest-neighbor (not DBSCAN)
- Uploads 150x150 face crop JPEGs to R2 under `faces/` prefix
- Updates `persons` and `detected_faces` tables in Supabase

## Key files
- `src/main.py` — Entry point, poll loop
- `src/config.py` — All env vars and tuning constants
- `src/detector.py` — InsightFace model loading and face detection
- `src/clustering.py` — Nearest-neighbor person assignment via pgvector
- `src/storage.py` — R2 and Supabase I/O operations

## Running locally
```bash
cp .env .env   # fill in real values
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m src.main
```

## Shared infrastructure
- Same Supabase project as the Next.js app (uses SERVICE_ROLE_KEY, bypasses RLS)
- Same R2 bucket (reads originals, writes face crops)
- DB tables: `face_jobs`, `persons`, `detected_faces` (defined in `supabase/migrations/006_face_recognition.sql`)

## Conventions
- No Django/Flask — this is a standalone worker, not a web server
- All Supabase access goes through `storage.py` (single module for DB I/O)
- Model loaded once at startup, reused for all jobs
