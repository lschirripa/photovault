import os

# Supabase
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Cloudflare R2 (S3-compatible)
R2_ACCOUNT_ID = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "photovault")
R2_ENDPOINT_URL = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Worker tuning
POLL_INTERVAL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", "5"))
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "10"))
COSINE_DISTANCE_THRESHOLD = float(os.environ.get("COSINE_DISTANCE_THRESHOLD", "0.55"))

# InsightFace
INSIGHTFACE_MODEL = os.environ.get("INSIGHTFACE_MODEL", "buffalo_l")
MIN_FACE_CONFIDENCE = float(os.environ.get("MIN_FACE_CONFIDENCE", "0.5"))

# Face crop settings
FACE_CROP_SIZE = 150        # px, square
FACE_CROP_PADDING = 0.3     # 30% padding around detected bbox
FACE_CROP_JPEG_QUALITY = 85
