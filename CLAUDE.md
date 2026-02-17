# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (0.0.0.0:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # TypeScript check (tsc --noEmit)
```

No test framework is configured yet.

## Architecture

Next.js 15 App Router + TypeScript + Tailwind CSS + Supabase + Cloudflare R2, organized as **Clean Architecture**:

- **`src/domain/`** — Entities (User, Group, MediaAsset, Album), enums (MemberRole, MediaType), errors, types. No external dependencies.
- **`src/application/`** — DTOs, repository interfaces, service interfaces. Depends only on domain.
- **`src/infrastructure/`** — Implementations: Supabase clients, R2 storage (singleton via `getStorageService()`), Upstash Redis (rate limiting + caching), Google Drive API, metadata extraction, reverse geocoding. Config in `infrastructure/config/env.ts` and `limits.ts`.
- **`src/presentation/`** — React components, hooks, providers, styles. All under `presentation/`.
- **`src/app/`** — Next.js App Router pages and API routes. Route groups: `(auth)` for login/signup, `(dashboard)` for protected pages.

Path alias: `@/*` → `./src/*`

### Supabase Client Types

Three clients exist for different contexts:
- **Browser client** (`createClient()`) — Used in client components, respects RLS
- **Server client** (`createServerComponentClient()`) — Used in API routes, reads cookies via middleware
- **Service client** (`createServiceClient()`) — Uses service role key, bypasses RLS

All Supabase query results require type casts: `as unknown as { data: Type; error: Error | null }`

### Media Upload Flow

Presign → Upload to R2 → Confirm → QStash dispatches thumbnail webhook (fallback: direct fetch)

- Small files (<10MB): presigned PUT
- Large files (>10MB): S3 multipart via Uppy
- HEIC images get converted to JPEG web-versions stored as `web_*` keys in R2

### Key Infrastructure

- **Rate limiting**: Upstash Redis — upload 30/min, standard 60/min, webhook 10/min. Graceful no-op if Redis not configured.
- **URL caching**: Client-side module-level Map with 45-min TTL (`use-url-cache.ts`), plus `Cache-Control: private, max-age=2700` headers
- **Virtualization**: `@tanstack/react-virtual` in media grid for DOM efficiency
- **Cron**: Vercel runs `GET /api/admin/cleanup` hourly to remove orphaned uploads (1hr threshold)

### Face Worker (`apps/face-worker/`)

Separate Python microservice — polls `face_jobs` table, runs InsightFace detection, clusters via pgvector. See `apps/face-worker/CLAUDE.md`.

## Database

Migrations in `supabase/migrations/` (001–010). RLS enabled on all tables; group access checked via `group_members` join.

Key tables: `profiles`, `groups`, `group_members`, `media_assets`, `albums`, `album_media`, `detected_faces`, `persons`, `group_activity`

Cursor pagination: `media_assets` uses `created_at`, `album_media` uses `added_at`.

## Patterns & Conventions

- Pages are client components (`"use client"`) using browser Supabase client and custom hooks
- API routes authenticate via `supabase.auth.getUser()`, verify group membership, then perform business logic
- Storage service is a lazy-initialized singleton (`getStorageService()`)
- `middleware.ts` refreshes auth sessions but excludes `api/webhooks/*` and `api/admin/*`
- `NEXT_PUBLIC_*` env vars must be static string literals for client-side inlining

## Environment Variables

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

Optional: `R2_BUCKET_NAME` (default: "photovault"), `R2_PUBLIC_URL`, `NEXT_PUBLIC_APP_URL` (default: localhost:3000), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, Google API keys
