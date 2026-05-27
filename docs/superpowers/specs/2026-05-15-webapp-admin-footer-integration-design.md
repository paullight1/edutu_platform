# Web App Admin Footer Integration Design

## Goal

Make admin access discoverable from the Edutu web app footer while keeping the admin area unavailable to non-admin users.

## Architecture

The main web app already owns an internal `/admin/*` route. The footer will link to `/admin` so the platform feels like one app. The link is public navigation only; authorization remains enforced by `AdminGuard` and backend admin guards.

The standalone `admin/` app stays separate for now because it uses a different Vite/React/router stack and is not configured for subpath hosting. A full merge would be a larger migration.

## Access Model

Everyone can see the `Admin` footer link. Signed-out users who click it are sent to `/auth`. Signed-in users are allowed into `/admin` only when they have a controlled admin role or an allowed admin email. Normal signed-in users are redirected to `/app/home`.

Admin roles are `super_admin`, `admin`, `moderator`, and `support_agent`. Role checks should not use user-editable metadata. Frontend checks are only UX gates; backend endpoints must continue to enforce `AdminGuard`.

## Components

- `LandingPageV3` adds a visible footer link to `/admin`.
- `adminAccess` centralizes role and email checks for reuse.
- `AdminGuard` uses the shared helper and attempts to include profile role data where available.

## Testing

Add focused tests for:

- public footer includes an `Admin` link to `/admin`;
- admin access allows controlled roles and configured emails;
- admin access rejects regular users.

## Security Notes

No service role key is exposed to the browser. The visible footer link must not be treated as authorization. Supabase RLS and backend guards remain the real enforcement points for data and admin APIs.
