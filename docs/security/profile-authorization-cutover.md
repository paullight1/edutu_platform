# Profile authorization cutover

## Boundary

`public.profiles.role` is the canonical server-owned authorization field. Client
profile updates may write permitted descriptive fields and non-authorization
preferences, but may not insert or update `profiles.role` or place any of these
keys in `profiles.preferences`:

- `role`
- `admin`
- `is_admin`
- `isAdmin`

The NestJS `AdminGuard` remains unchanged. The request guard resolves a role
from the canonical profile row first, then from verified Clerk public metadata
or Supabase `app_metadata`; it does not use user-editable metadata.

## Migration behavior

`20260812181300_harden_profile_authorization.sql`:

1. explicitly revokes `profiles.role` insert/update grants from `anon` and
   `authenticated`, while retaining them for `service_role`;
2. removes stale authorization-shaped preference keys already stored in the
   canonical profile table;
3. rejects new client-role writes containing those keys; and
4. drops any legacy `public.profiles` RLS policy whose expression reads role or
   admin state from `preferences`.

This is intentionally fail-closed for direct Data API admin access. Backend
admin operations continue through the service-role path and verified request
identity.

## Required staging checks before any production change

Do not apply this migration to production until the deployed identity and SQL
baseline are confirmed. In staging, use a disposable regular account and a
verified admin account to confirm all of the following:

1. `profiles.role` exists and is the server-owned role field used by the
   deployed backend.
2. `anon` and `authenticated` lack `INSERT` and `UPDATE` privilege on that
   column; `service_role` retains both.
3. A regular user can save ordinary profile fields and ordinary preferences,
   but an update containing `preferences.role = 'admin'` is rejected with
   `42501` and does not change the persisted role.
4. Admin backend endpoints still accept the verified admin and reject the
   regular account. Verify the existing email allowlist and verified Clerk app
   metadata path used by `AdminGuard`.
5. `opportunity_admin_stats()` remains non-executable by `authenticated`.
6. Identify the deployed CV/resume relation, if one exists, and prove a
   regular account cannot select rows belonging to another user. The canonical
   migration tree does not define a CV/resume relation, so this mapping cannot
   be inferred safely from source.
7. Run `supabase/tests/security_profile_authorization.sql` against staging
   with pgTAP, then review Supabase Security and Performance Advisor results.

## Rollback

Do not restore client authorization from `preferences`. If a verified backend
or admin workflow regresses, roll back the migration only after preserving the
role column grants and identifying the affected server-side caller. Restore
access through a server-owned column or verified provider app metadata, then
add a focused regression test before retrying the cutover.
