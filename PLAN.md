# PhotoVault PWA - Architecture Plan

## Project Overview

A high-performance, private PWA for group-based photo/video sharing with:
- **Framework**: Next.js 15+ (App Router) + TypeScript + Tailwind CSS
- **Backend/Auth**: Supabase (PostgreSQL + Auth with OAuth/Email/Magic Link)
- **Storage**: Cloudflare R2 with presigned URL direct uploads
- **Deployment**: Vercel
- **Media Processing**: Thumbnail generation with Sharp

---

## Architecture Overview

This project follows Clean Architecture principles with the following layers:

### 1. Domain Layer (`src/domain/`)
- **Entities**: Core business objects (User, Group, GroupMember, MediaAsset)
- **Enums**: Domain enumerations (MemberRole, MediaType, MediaStatus)
- **Errors**: Domain-specific error classes

### 2. Application Layer (`src/application/`)
- **Repositories**: Interfaces defining data access contracts
- **Services**: Interfaces for external services (Auth, Storage)
- **DTOs**: Data Transfer Objects for API boundaries
- **Use Cases**: Application-specific business logic (to be implemented)

### 3. Infrastructure Layer (`src/infrastructure/`)
- **Supabase**: Database client and repository implementations
- **Cloudflare**: R2 storage service implementation
- **Config**: Environment configuration

### 4. Presentation Layer (`src/presentation/`)
- **Components**: React UI components (ui, forms, layout)
- **Hooks**: Custom React hooks for state management
- **Providers**: React context providers (Auth)
- **Styles**: Global CSS styles

### 5. App Layer (`src/app/`)
- Next.js App Router pages and API routes
- Route groups for auth and dashboard

---

## Database Schema

### Tables
- `profiles` - User profiles (extends auth.users)
- `groups` - Photo sharing groups
- `group_members` - Group membership with roles (owner/admin/member)
- `media_assets` - Uploaded photos and videos

### Row Level Security
All tables have RLS enabled with policies for:
- Users can only view/modify their own data
- Group members can view group content
- Owners/admins have elevated permissions

---

## Key Features

### Authentication
- Email/password signup and signin
- OAuth providers (Google, GitHub)
- Magic link (passwordless) authentication
- Session management with Supabase Auth

### Groups
- Create, read, update, delete groups
- Member management with role-based permissions
- Group-scoped media access

### Media Upload
- Presigned URL direct upload to Cloudflare R2
- Support for images (JPEG, PNG, GIF, WebP, HEIC)
- Support for videos (MP4, MOV, WebM)
- Automatic thumbnail generation for images
- Upload progress tracking

### PWA
- Installable on mobile and desktop
- Service worker for offline caching
- Push notification support

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/media/presign` | POST | Get presigned URL for upload |
| `/api/media/confirm` | POST | Confirm upload completion |
| `/api/webhooks/thumbnail` | POST | Generate thumbnails |

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# Application
NEXT_PUBLIC_APP_URL=
```

---

## Implementation Status

### Phase 1: Project Initialization ✅
- [x] Design architecture
- [x] Initialize Next.js 15 project with TypeScript
- [x] Configure Tailwind CSS
- [x] Set up project structure (Clean Architecture directories)
- [x] Create TypeScript interfaces (domain entities)
- [x] Create SQL migration file
- [x] Configure PWA manifest
- [x] Set up environment configuration
- [x] Create PLAN.md documentation

### Phase 2: Infrastructure Setup ✅
- [x] Configure Supabase client
- [x] Implement repository interfaces
- [x] Set up Cloudflare R2 client with AWS SDK
- [x] Implement presigned URL service
- [x] Configure authentication providers

### Phase 3: Core Features ✅
- [x] Implement authentication flows (login, register, OAuth, magic link)
- [x] Build group management (create, list, view)
- [x] Implement media upload with presigned URLs
- [x] Add thumbnail generation

### Phase 4: PWA & Polish (Remaining)
- [x] Service worker for offline support
- [ ] Push notifications for new uploads
- [ ] Responsive design refinement
- [ ] Performance optimization (lazy loading, caching)
- [ ] Implement repository pattern in infrastructure layer
- [ ] Add comprehensive error handling
- [ ] Add loading states and skeletons
- [ ] Implement media gallery with lightbox

---

## Getting Started

1. Clone the repository
2. Copy `.env.local.example` to `.env.local` and fill in values
3. Run the SQL migration in Supabase
4. Install dependencies: `npm install`
5. Start development server: `npm run dev`

---

## Verification Checklist

After setup:
1. `npm run build` - Should complete without errors
2. `npm run type-check` - Should pass
3. `npm run lint` - Should pass
4. Access `/manifest.json` - Returns valid PWA manifest
5. All Clean Architecture layers in place
6. Environment variables documented
