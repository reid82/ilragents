# Auth Gating for Unauthenticated Users

**Date:** 2026-02-23
**Status:** Design approved

## Problem

- No route protection exists. All pages (chat, roadmap, admin, war-room) are accessible via direct URL without authentication.
- Unauthenticated users see the full landing page with locked advisor cards and dev tools. They should not see the app at all.

## Solution

### 1. Next.js Middleware

Create `packages/web/src/middleware.ts` that runs on every request before page rendering.

**Public routes (no auth required):**
- `/login`
- `/api/*` (API routes handle auth via headers independently)
- `/_next/*` (Next.js internals)
- Static files: `favicon.ico`, `ilre-logo.png`, etc.

**Protected routes (everything else):**
- `/` (homepage)
- `/chat/*`
- `/onboarding`
- `/roadmap`
- `/war-room`
- `/admin/*`

**Auth check mechanism:**
- Check for Supabase auth cookies (cookies starting with `sb-` containing `auth-token`)
- If no auth cookie: redirect to `/login`
- If auth cookie exists: allow request through
- This is a lightweight existence check, not full token validation. Client-side AuthProvider handles real session validation.

### 2. Login Page Cleanup

- Remove "Back to home" link from login page since unauthenticated users cannot access home

### What stays the same
- AuthProvider continues doing real session validation client-side
- Dev panel, test profiles, and all existing functionality unchanged for authenticated users
- All API routes remain publicly accessible (they check auth headers independently)

## Files Changed

1. `packages/web/src/middleware.ts` (new) - ~30 lines
2. `packages/web/src/app/login/page.tsx` - remove "Back to home" link
