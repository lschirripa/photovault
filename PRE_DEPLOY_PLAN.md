# PhotoVault Pre-Deploy & Deploy Plan

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Build-Blocking Issues](#2-build-blocking-issues)
3. [Bugs & Critical Fixes](#3-bugs--critical-fixes)
4. [Feature Enhancements for Production](#4-feature-enhancements-for-production)
5. [Scalability & Cloud Readiness](#5-scalability--cloud-readiness)
6. [Database Hardening](#6-database-hardening)
7. [Platform Selection & Rationale](#7-platform-selection--rationale)
8. [Deployment Configuration](#8-deployment-configuration)
9. [Post-Deploy Monitoring](#9-post-deploy-monitoring)
10. [Implementation Phases](#10-implementation-phases)

---

## 1. Executive Summary

PhotoVault consists of two deployable units:
- **Next.js web app** — App Router, client components, API routes, Supabase + R2
- **Face worker** — Python polling service, InsightFace (CPU-only), pgvector clustering

Current state: **~75% production-ready**. The architecture is solid (clean architecture, rate limiting, pagination, virtualization), but there are **2 build-blocking errors**, **~15 bugs** ranging from critical to low, and several hardening items needed before production traffic.

---

## 2. Build-Blocking Issues

These **must be fixed before any deployment** — the app does not build.

### 2A. `useSearchParams()` Missing Suspense Boundary (BLOCKS BUILD)

**Files:**
- `src/app/(auth)/register/page.tsx`
- `src/app/(auth)/signin/page.tsx`

**Error:** Next.js 15 requires `useSearchParams()` to be wrapped in `<Suspense>`. The build fails with:
```
useSearchParams() should be wrapped in a suspense boundary at page "/register"
```

**Fix:** Either wrap the component in `<Suspense>` in a parent layout, or extract the `useSearchParams()` usage into a child component wrapped with Suspense.

### 2B. Missing `@eslint/eslintrc` Package (BLOCKS BUILD)

**File:** `eslint.config.mjs` imports `@eslint/eslintrc` but it's not installed.

**Error:** `Cannot find package '@eslint/eslintrc'`

**Fix:** `npm install --save-dev @eslint/eslintrc`

---

## 3. Bugs & Critical Fixes

### CRITICAL (Data loss / security / broken functionality)

| # | Issue | File(s) | Description |
|---|-------|---------|-------------|
| 3.1 | HEIC web key not deleted | `api/media/[assetId]/route.ts:67-72` | Single-asset DELETE only removes `original_key` + `thumbnail_key`, leaking HEIC `web_*` R2 objects. Group deletion handles this correctly via `getHeicWebKey()` but individual delete does not. |
| 3.2 | Persons merge race condition | `api/persons/merge/route.ts:64-97` | Non-atomic multi-step mutation (reassign faces → update centroid → delete source) without transaction. If any step fails after face reassignment, source person becomes orphaned with 0 faces. |
| 3.3 | Person PATCH validation bug | `api/persons/[personId]/route.ts:23` | Uses `&&` instead of requiring at least one valid field. Allows requests with no valid fields to pass through. |
| 3.4 | CRON_SECRET not enforced | `api/admin/cleanup/route.ts:10-11` | If `CRON_SECRET` is unset, any authenticated user can trigger the cleanup cron. In production, this must be required. |

### HIGH (Poor UX / silent failures)

| # | Issue | File(s) | Description |
|---|-------|---------|-------------|
| 3.5 | Webhook fire-and-forget | `api/media/confirm/route.ts:71-76` | Thumbnail webhook dispatched without await or retry. If webhook fails, asset stays in "processing" forever. QStash integration is documented but `@upstash/qstash` is **not installed**. |
| 3.6 | Download-zip silent skip | `api/media/download-zip/route.ts:87-90` | Failed individual file downloads silently skip. User receives incomplete zip with no warning. |
| 3.7 | Face reassignment silent fail | `presentation/components/gallery/face-tags.tsx:103-135` | `handleReassign` catches errors silently, updates local state before confirming server success. |
| 3.8 | Album cover optimistic update | `groups/[groupId]/albums/[albumId]/page.tsx:477-492` | Sets local state before confirming API success. On failure, UI shows wrong cover. |
| 3.9 | Upload page Google Drive token | `upload/page.tsx:251-257` | `requestNewToken()` returns old `accessToken` because `openPicker()` is async but token update comes via state change. |
| 3.10 | Missing error boundaries | Entire app | No React Error Boundaries anywhere. A single component error crashes the entire page. |

### MEDIUM (Edge cases / validation gaps)

| # | Issue | File(s) | Description |
|---|-------|---------|-------------|
| 3.11 | parseInt NaN propagation | `api/persons/[personId]/media/route.ts:25` | `parseInt("abc")` → `NaN` → `Math.min(NaN, 100)` → `NaN` → query failure. |
| 3.12 | Geo bounds no range check | `api/media/geo/route.ts:36-41` | No lat/lng range validation (±90/±180). Invalid bounds silently return all data. |
| 3.13 | Pgvector parse no validation | `api/persons/merge/route.ts:113-116` | `parsePgVector()` doesn't validate array length or NaN values. Corrupted centroid stored. |
| 3.14 | Reverse geocoding no timeout | `infrastructure/services/reverse-geocoding-service.ts:12-39` | Nominatim fetch has no timeout. Can hang webhook pipeline. |
| 3.15 | Polling interval re-creation | `groups/[groupId]/page.tsx:349-384` | Polling `useEffect` depends on `media` which changes often, creating/destroying intervals rapidly. |
| 3.16 | Upload progress panel dep | `upload/upload-progress-panel.tsx:78-80` | `useEffect` dep `[uploads.length <= 5]` creates new boolean each render. |

---

## 4. Feature Enhancements for Production

### Required for Launch

| # | Enhancement | Priority | Effort |
|---|-------------|----------|--------|
| 4.1 | **Security headers** — Add `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, CSP via `next.config.ts` headers or middleware | High | Small |
| 4.2 | **MIME whitelist on downloads** — Content-Type from DB used in response headers without validation. Whitelist allowed types, default to `application/octet-stream` | High | Small |
| 4.3 | **`.env.example`** — No environment variable documentation for new deployments. Create with all required/optional vars | High | Small |
| 4.4 | **Node.js engine field** — Add `"engines": { "node": ">=18.17.0" }` to `package.json` | High | Trivial |
| 4.5 | **Install QStash package** — `@upstash/qstash` is imported in code but not in `package.json` / `node_modules`. Install it or remove dead imports | High | Small |

### Recommended for Production Quality

| # | Enhancement | Priority | Effort |
|---|-------------|----------|--------|
| 4.6 | **Error tracking (Sentry)** — No production error tracking. 66 `console.error/warn` calls across 34 files. These are invisible in production | Medium | Medium |
| 4.7 | **Rate limit UI feedback** — API enforces rate limits but client shows generic "failed" with no explanation | Medium | Small |
| 4.8 | **Skeleton loaders** — Generic "Loading..." text on GroupDetail, AlbumDetail, PersonDetail, Settings pages. Should show content skeletons | Medium | Medium |
| 4.9 | **Standardize API errors** — Inconsistent error messages ("Not a member of this group" vs "Access denied"). Add error codes | Medium | Medium |
| 4.10 | **Hardcoded version** — `settings/page.tsx:131` shows `"Version 0.1.0"` hardcoded. Read from `package.json` or env | Low | Trivial |

---

## 5. Scalability & Cloud Readiness

### Infrastructure Concerns

| # | Issue | Severity | Description |
|---|-------|----------|-------------|
| 5.1 | **Rate limiter fail-open** | High | `infrastructure/redis/with-rate-limit.ts:31-33` — Redis errors silently allow all requests through. No logging. If Redis goes down, rate limiting disappears entirely. |
| 5.2 | **R2 credential validation** | High | `infrastructure/cloudflare/r2-storage-service.ts:22-32` — Constructor doesn't validate credentials. Empty strings from `env.ts` (marked `required: false`) create S3Client that fails on first operation with cryptic AWS SDK errors. |
| 5.3 | **Env var fail-open** | High | `infrastructure/config/env.ts:23-27` — R2 credentials are `required: false`. If missing, the app starts but all storage operations fail. Should be required or validated at init. |
| 5.4 | **Metadata extraction unbounded** | Medium | `infrastructure/services/metadata-extraction-service.ts:43+` — No buffer size check before `exifr.parse()`. Large files could OOM serverless functions. |
| 5.5 | **Album media count O(N)** | Medium | `api/albums/route.ts:54-57` — Fetches all `album_media` rows to count per album. Should use `count: "exact"` per album or DB aggregate. |
| 5.6 | **Download-zip stream leak** | Medium | `api/media/download-zip/route.ts:100-112` — If client disconnects, archive continues processing. No AbortController cleanup. |
| 5.7 | **HEIC key logic duplicated** | Low | Old/new key scheme detection duplicated across `api/media/url`, `api/media/urls`, `api/webhooks/thumbnail`. Should centralize. |
| 5.8 | **Middleware latency** | Low | `middleware.ts` calls `supabase.auth.getUser()` on every request (network round-trip to Supabase). Monitor latency in production. |

### Bundle Size Concerns

The THREE.js ecosystem (`@react-three/fiber`, `three`, `three-globe`, `react-globe.gl`, `r3f-globe`) adds ~500KB+ gzipped. This is used for the globe/map feature. Ensure it's code-split (dynamic import) so it doesn't affect initial page load.

### npm Audit

One **high severity** vulnerability in `minimatch <3.1.3` (ReDoS). Fix with `npm audit fix`.

---

## 6. Database Hardening

### RLS Policy Issues

| # | Issue | Table | Severity |
|---|-------|-------|----------|
| 6.1 | **group_invites SELECT is `USING (true)`** | `group_invites` | High — All authenticated users can read ALL group invites from any group. Comment says "filter at app layer" but this leaks invite metadata. Fix: scope to group membership or token-based lookup only. |
| 6.2 | **Groups/Albums UPDATE relaxed** | `groups`, `albums` (migration 014) | Medium — All group members can UPDATE (not just owner/admin). API layer restricts name/description changes but RLS doesn't enforce it. If RLS is bypassed (e.g., via SQL editor), any member can rename groups. |

### Missing Constraints

| # | Constraint | Table | Severity |
|---|-----------|-------|----------|
| 6.3 | Email nullable | `profiles` | Medium — `email TEXT` (nullable) from migration 009. Used in display without null checks. Add NOT NULL after backfill verification. |
| 6.4 | No MIME type validation at DB level | `media_assets` | Low — Presign API validates, but no defense-in-depth at schema level. |

### Index Coverage

Index coverage is **excellent** (9/10). 30+ indexes across tables covering:
- Cursor pagination (`created_at`, `added_at`)
- Filter/sort queries (date, type, location, camera, size)
- Face recognition (HNSW vector, partial indexes for job queue)
- Person lookup (composite person_id + created_at)

**No missing critical indexes identified.**

### Migration Safety

All 14 migrations are safe for production. Migration 012 (face count cleanup) does a data repair scan but expected runtime is <5 seconds on typical data.

**pgvector extension** must be manually enabled on Supabase: Dashboard → Database → Extensions → `vector`.

---

## 7. Platform Selection & Rationale

### Next.js Web App → **Vercel**

| Factor | Assessment |
|--------|-----------|
| **Framework fit** | Vercel is built by the Next.js team. First-class support for App Router, API routes, middleware, ISR, image optimization. No other platform matches this level of integration. |
| **Serverless API routes** | Each API route runs as an isolated serverless function. Auto-scales per-endpoint. No server management. |
| **Edge middleware** | Auth session refresh middleware runs at the edge (CDN), minimal latency globally. |
| **Cron jobs** | Native Vercel Cron (`vercel.json` already configured). No external scheduler needed. |
| **Sharp (image processing)** | Vercel bundles Sharp natively in serverless functions. No compilation issues. |
| **R2 integration** | Vercel functions can call Cloudflare R2 via S3 API. No special configuration needed. |
| **Environment variables** | Dashboard UI for managing env vars per environment (Preview, Production, Development). |
| **Preview deployments** | Every PR gets a preview URL automatically. Critical for testing. |
| **Downsides** | Serverless function timeout (10s free, 60s Pro, 300s Enterprise). The download-zip route may need optimization for large archives. Bundle size limits (50MB compressed default). |

**Alternatives considered:**
- **AWS Amplify** — Good Next.js support but behind Vercel on App Router features. More complex setup.
- **Netlify** — Next.js support via adapter, but historically behind on new features. Edge functions have different runtime.
- **Docker on ECS/Cloud Run** — Full control but requires managing infrastructure, scaling, SSL, CDN. Overkill for initial deployment.
- **Self-hosted** — Maximum control, minimum cost at scale, but high ops overhead. Not recommended for initial launch.

**Verdict: Vercel is the clear winner** for the Next.js app due to native integration, zero-config deployment, and preview environments.

### Face Worker → **Railway** or **Fly.io** (container platform)

| Factor | Railway | Fly.io | AWS ECS | Self-hosted VPS |
|--------|---------|--------|---------|-----------------|
| **Docker support** | Native | Native | Native | Manual |
| **Long-running process** | Yes | Yes | Yes | Yes |
| **Auto-restart** | Yes | Yes | Yes | systemd |
| **Scaling** | Manual/API | Auto (machines) | Auto (Fargate) | Manual |
| **Pricing** | Pay per usage | Pay per usage | Complex pricing | Fixed cost |
| **Setup complexity** | Very low | Low | High | High |
| **Logs** | Dashboard | Dashboard | CloudWatch | Manual |
| **Secrets management** | Dashboard | Dashboard | Secrets Manager | Manual |
| **GPU** | No (not needed) | No (not needed) | Available | Manual |

**Why NOT Vercel/Lambda/Cloud Functions:**
- Face worker is a **long-running polling process** (infinite loop, 5s poll interval)
- Serverless platforms have request timeouts (10-300s)
- Would require re-architecting to event-driven (webhook per job) — unnecessary complexity

**Why NOT Kubernetes:**
- Over-engineered for a single worker container
- Requires cluster management, Helm charts, monitoring stack
- Only makes sense at 10+ microservices scale

**Recommended: Railway**
- Simplest deployment: `railway up` with Dockerfile
- Pay-per-usage ($5/month minimum + resource usage)
- Native Docker support, environment variables in dashboard
- Good for 1-3 worker replicas
- Easy to scale up if queue depth grows

**Alternative: Fly.io**
- Slightly more configuration (fly.toml)
- Better geographic distribution (machines in multiple regions)
- Auto-scaling based on metrics
- Good if workers need to be close to Supabase region

**Resource requirements per worker:**
- Memory: 2-4 GB (InsightFace model: ~500MB + image processing scratch)
- CPU: 2 vCPU (CPU-bound inference, single-threaded)
- Disk: 500 MB (model cache)
- Network: 5-50 Mbps (image downloads from R2)

---

## 8. Deployment Configuration

### 8A. Vercel — Next.js Web App

#### Environment Variables (Set in Vercel Dashboard)

**Required (Production):**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
R2_ACCOUNT_ID=xxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxx
NEXT_PUBLIC_APP_URL=https://your-domain.com     # CRITICAL: used for webhook URLs
CRON_SECRET=<generate-random-32-char-string>     # Vercel Cron auth
```

**Required (if using Redis rate limiting):**
```
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...
```

**Required (if using QStash job queue):**
```
QSTASH_TOKEN=eyJ...
QSTASH_CURRENT_SIGNING_KEY=sig_...
QSTASH_NEXT_SIGNING_KEY=sig_...
```

**Optional:**
```
R2_BUCKET_NAME=photovault              # Default: photovault
R2_PUBLIC_URL=https://cdn.example.com  # If using R2 public bucket
GOOGLE_API_KEY=...                     # Google Drive import
GOOGLE_CLIENT_ID=...                   # Google Drive import
```

#### vercel.json (Enhanced)

```json
{
  "crons": [
    {
      "path": "/api/admin/cleanup",
      "schedule": "0 * * * *"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

#### Build Settings (Vercel Dashboard)

- **Framework Preset:** Next.js (auto-detected)
- **Build Command:** `npm run build`
- **Install Command:** `npm install`
- **Output Directory:** `.next` (auto-detected)
- **Node.js Version:** 18.x or 20.x
- **Root Directory:** `/` (monorepo root, since face-worker is separate)

#### Domain Configuration

1. Add custom domain in Vercel Dashboard → Settings → Domains
2. DNS: Add CNAME or A records as Vercel instructs
3. SSL: Automatic (Let's Encrypt)
4. Set `NEXT_PUBLIC_APP_URL` to match production domain

#### Vercel Function Configuration

For potentially long-running routes, add to `vercel.json`:
```json
{
  "functions": {
    "src/app/api/media/download-zip/route.ts": {
      "maxDuration": 60
    },
    "src/app/api/webhooks/thumbnail/route.ts": {
      "maxDuration": 60
    },
    "src/app/api/admin/cleanup/route.ts": {
      "maxDuration": 60
    },
    "src/app/api/groups/*/route.ts": {
      "maxDuration": 30
    }
  }
}
```

> Note: Free tier max 10s, Pro tier max 60s, Enterprise max 300s. The download-zip and thumbnail routes likely need Pro tier.

### 8B. Railway — Face Worker

#### Setup Steps

1. Create Railway project → New Service → Docker
2. Point to `apps/face-worker/` directory (or separate repo)
3. Set environment variables in Railway dashboard:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
R2_ACCOUNT_ID=xxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxx
R2_BUCKET_NAME=photovault
POLL_INTERVAL_SECONDS=5
BATCH_SIZE=10
COSINE_DISTANCE_THRESHOLD=0.45
MIN_FACE_CONFIDENCE=0.70
```

4. Configure resource limits:
   - Memory: 4 GB
   - CPU: 2 vCPU
   - Replicas: 1 (scale to 2-3 as needed)

5. Deploy: Railway auto-builds from Dockerfile

#### Health Monitoring

Since face worker has no HTTP endpoints, monitor via:
- Railway logs dashboard (stdout/stderr from Python logging)
- Database query: `SELECT status, COUNT(*) FROM face_jobs GROUP BY status` (queue depth)
- Alert on: `failed` count growing, `pending` queue > 500

### 8C. Supabase — Database

#### Production Setup

1. **Project creation**: Create production Supabase project (separate from development)
2. **Enable pgvector**: Dashboard → Database → Extensions → Enable `vector`
3. **Run migrations**: Apply migrations 001-014 in order:
   ```bash
   supabase db push --linked
   # Or manually via SQL editor in order
   ```
4. **Verify RLS**: Check all policies are active in Dashboard → Authentication → Policies
5. **Connection string**: Note both:
   - Direct connection (port 5432) — for migrations
   - Pooler connection (port 6543) — for high-concurrency apps
6. **API keys**: Copy `anon` key and `service_role` key for environment variables

#### Backup Strategy

- Supabase Pro: Daily automatic backups with point-in-time recovery (PITR)
- Free tier: Manual backups via `pg_dump`
- Recommend: Pro plan for production ($25/month)

### 8D. Cloudflare R2 — Object Storage

#### Setup

1. R2 bucket already exists (`photovault`)
2. Verify CORS policy allows requests from production domain:
   ```json
   [
     {
       "AllowedOrigins": ["https://your-domain.com"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
3. API tokens: Create token with `Object Read & Write` permissions
4. Optional: Enable public access for a CDN-like URL

### 8E. Upstash Redis — Rate Limiting

#### Setup

1. Create Upstash Redis database at console.upstash.com
2. Select region closest to Vercel deployment (e.g., `us-east-1`)
3. Copy REST URL and REST Token
4. Set in Vercel env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
5. Optional but recommended: Enable eviction policy (allkeys-lru)

### 8F. Upstash QStash — Job Queue (Optional but Recommended)

#### Setup

1. Enable QStash in Upstash console
2. Copy token and signing keys
3. Set in Vercel env vars: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
4. Important: `NEXT_PUBLIC_APP_URL` must be the production URL for QStash to reach webhook endpoints

---

## 9. Post-Deploy Monitoring

### Vercel Built-in

- **Analytics**: Enable Vercel Analytics for Web Vitals (LCP, FID, CLS)
- **Speed Insights**: Monitor real-user performance
- **Logs**: Function logs available in dashboard (24h retention on free, 3 days Pro)
- **Alerts**: Set up for function errors, high latency

### Recommended Third-Party

| Service | Purpose | Priority |
|---------|---------|----------|
| **Sentry** | Error tracking (frontend + API routes) | High |
| **Upstash Redis Monitoring** | Rate limit hit rates, Redis health | Medium |
| **Supabase Dashboard** | Database size, query performance, auth usage | Medium |
| **Cloudflare R2 Dashboard** | Storage usage, bandwidth, operation counts | Low |

### Key Metrics to Watch

1. **API route error rates** — Should be <1% across all routes
2. **Thumbnail webhook success rate** — Track via face_jobs `completed` vs `failed` ratio
3. **Upload pipeline** — Monitor orphaned uploads (cleanup cron output)
4. **Face job queue depth** — `pending` should not consistently grow
5. **R2 storage growth** — Monitor for unexpected growth (HEIC leak, orphans)
6. **Serverless function duration** — Watch for routes approaching timeout limits

---

## 10. Implementation Phases

### Phase 0: Build Fixes (BLOCKING — do first)

- [ ] 0A: Wrap `useSearchParams()` in Suspense boundary in register + signin pages
- [ ] 0B: Install `@eslint/eslintrc` dev dependency
- [ ] 0C: Run `npm audit fix` for minimatch vulnerability
- [ ] 0D: Verify build passes: `npm run build`

### Phase 1: Critical Bugs (Before first deploy)

- [ ] 1A: Fix HEIC web key deletion in single-asset DELETE route
- [ ] 1B: Fix person PATCH validation (`&&` → proper field checking)
- [ ] 1C: Enforce `CRON_SECRET` in production
- [ ] 1D: Install `@upstash/qstash` or remove dead imports
- [ ] 1E: Add R2 credential validation in constructor
- [ ] 1F: Add env var validation (R2 as required)

### Phase 2: Security & Headers (Before public launch)

- [ ] 2A: Add security headers in `vercel.json`
- [ ] 2B: Add MIME type whitelist for download Content-Type
- [ ] 2C: Fix group_invites RLS policy (scope SELECT)
- [ ] 2D: Create `.env.example` with all vars documented
- [ ] 2E: Add Node.js engine field to `package.json`

### Phase 3: Reliability (First sprint post-deploy)

- [ ] 3A: Add React Error Boundary component, wrap pages
- [ ] 3B: Add timeout to reverse geocoding fetch (5s)
- [ ] 3C: Fix persons merge race condition (error handling + rollback)
- [ ] 3D: Fix face reassignment UI (wait for server confirmation)
- [ ] 3E: Fix album cover optimistic update
- [ ] 3F: Fix download-zip to report skipped files
- [ ] 3G: Add rate limit fail-closed logging

### Phase 4: UX Polish (Second sprint)

- [ ] 4A: Add skeleton loaders for main pages
- [ ] 4B: Add rate limit feedback in UI
- [ ] 4C: Standardize API error codes
- [ ] 4D: Fix polling interval re-creation
- [ ] 4E: Fix parseInt NaN propagation in person media
- [ ] 4F: Read version from package.json

### Phase 5: Observability (Ongoing)

- [ ] 5A: Integrate Sentry for error tracking
- [ ] 5B: Replace console.error/warn with structured logging
- [ ] 5C: Add request correlation IDs
- [ ] 5D: Set up alerting for key metrics

### Phase 6: Face Worker Deploy

- [ ] 6A: Create Railway project + link to apps/face-worker/
- [ ] 6B: Set environment variables
- [ ] 6C: Verify pgvector extension enabled on Supabase
- [ ] 6D: Deploy and verify job processing
- [ ] 6E: Add graceful shutdown handler (SIGTERM → rollback in-progress job)
- [ ] 6F: Monitor queue depth and processing rates

---

## Appendix: Console Statement Audit

66 `console.*` calls across 34 files in `src/`. These should be:
- **API routes**: Replaced with structured logger (or at minimum kept — they appear in Vercel function logs)
- **Client components**: Removed or wrapped with `process.env.NODE_ENV === 'development'` check
- **Infrastructure**: Replaced with proper error reporting (Sentry)

## Appendix: Full Environment Variable Reference

| Variable | Required | Used By | Default |
|----------|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser + Server | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser + Server | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server (webhooks, service ops) | — |
| `R2_ACCOUNT_ID` | Yes | Server (storage) | — |
| `R2_ACCESS_KEY_ID` | Yes | Server (storage) | — |
| `R2_SECRET_ACCESS_KEY` | Yes | Server (storage) | — |
| `R2_BUCKET_NAME` | No | Server (storage) | `photovault` |
| `R2_PUBLIC_URL` | No | Server (public URLs) | — |
| `NEXT_PUBLIC_APP_URL` | Yes* | Server (webhooks, redirects) | `http://localhost:3000` |
| `UPSTASH_REDIS_REST_URL` | No** | Server (rate limiting) | — (no-op) |
| `UPSTASH_REDIS_REST_TOKEN` | No** | Server (rate limiting) | — (no-op) |
| `QSTASH_TOKEN` | No** | Server (job queue) | — (fallback fetch) |
| `QSTASH_CURRENT_SIGNING_KEY` | No** | Server (webhook verify) | — (skip verify) |
| `QSTASH_NEXT_SIGNING_KEY` | No** | Server (webhook verify) | — (skip verify) |
| `CRON_SECRET` | Yes* | Server (cleanup cron) | — |
| `GOOGLE_API_KEY` | No | Client (Drive import) | — |
| `GOOGLE_CLIENT_ID` | No | Client (Drive import) | — |

\* Must be set for production
\** Recommended for production (graceful degradation if unset)
