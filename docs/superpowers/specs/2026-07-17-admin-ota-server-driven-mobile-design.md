# Admin-controlled OTA / server-driven mobile features — Design

**Date:** 2026-07-17
**Scope:** Edutu mobile app (Expo). Web app out of scope for this spec.
**Goal:** Let admins change what users see in the mobile app — content, feature
availability, home-screen composition, and brand-new web-backed features —
without users updating from the store, and let developers ship real JS changes
OTA via EAS Update.

## Problem

Today the mobile home screen and feature set are hardcoded in the app binary.
Any content or feature change needs a store release, which is slow and depends
on users updating. We want fresh content and new features to appear on next app
open, admin-driven, with strong fail-open safety so a bad config can never brick
the primary screen.

## Approach (chosen: A — extend the existing config backbone)

Everything rides on infrastructure already shipped:
`admin_settings.mobileApp` → public `GET /mobile-control/config` → mobile
`AppControlProvider` (cache-first, refetch on foreground). We add three new
admin-controlled surfaces and one mobile renderer.

### New concepts

1. **Feature flags (reveal + lock).** The app already has
   `appControl.moduleLocks` (free/pro/disabled) and a `mobile_feature_flags`
   table. We add a `featureFlags: Record<string,boolean>` map inside
   `mobileApp` for simple on/off reveal of dark-shipped features, exposed via a
   `useFeatureFlag(key)` hook. `moduleLocks` keeps its current meaning.

2. **Home layout (server-driven UI).** A new `mobileApp.homeLayout` with a
   `draft`/`published` pair. `published` is an ordered array of typed blocks:
   `{ id, type, props }`. The mobile app renders blocks through a **block
   registry**. Native block types (`recommendations`, `categories`,
   `quick_stats`, `profile_prompt`) delegate to the existing home components;
   content block types (`announcement`, `promo_banner`, `curated_rail`,
   `info_card`, `web_feature`) are new lightweight components. `draft` lets the
   admin stage + preview without affecting users; `lastPublished` enables
   one-step rollback.

3. **Custom features (the Twitter/X pattern).** A new
   `mobileApp.customFeatures` array: `{ id, title, subtitle?, icon, url,
   openMode: 'webview'|'external', placement: 'home'|'tools'|'both', enabled }`.
   The admin points a feature at any URL (typically an edutu.org page). In the
   app it opens in an in-app WebView (`openMode:'webview'`) or the system
   browser (`'external'`). This is how an admin "adds a new feature" that the
   app never shipped native code for.

### Fail-open safety (the core requirement)

- Every new settings key is **optional with a default**, so an older admin
  client that PUTs the old shape, or a partial write, never fails the
  `mergeAdminSettings` Zod parse. (Known gotcha: one invalid key makes ALL
  settings fall back to defaults.)
- Mobile normalises the config defensively: bad/missing `homeLayout` →
  `published: []`. When `published` is empty, the app renders its **existing
  hardcoded home** unchanged.
- Block registry **silently skips unknown block types** — so when we later ship
  a new block type via EAS Update, older app binaries ignore it instead of
  crashing.
- Per-block render is wrapped so one bad block renders nothing, not a crash.
- `customFeatures` with a malformed URL degrade to a WebView error state, never
  a crash.

## Architecture

### Backend (`backend/services/services/api/src`)

- `settings/settings.dto.ts`
  - New Zod schemas: `HomeBlockSchema`, `HomeLayoutSchema`
    (`draft`/`published`/`lastPublished` arrays), `CustomFeatureSchema`.
  - Extend `MobileAppSettingsSchema` with optional-defaulted `featureFlags`,
    `homeLayout`, `customFeatures`.
  - Extend `DEFAULT_ADMIN_SETTINGS.mobileApp` + `mergeAdminSettings` mobileApp
    branch with the new keys (defensive `??` merges, same as existing keys).
  - Export types.
- `mobile-control/mobile-control.types.ts`
  - Extend `AppControlConfig` with `featureFlags`, `homeLayout` (published
    only — draft never leaves the server), `customFeatures` (enabled only).
- `mobile-control/mobile-control.service.ts`
  - `OPEN_APP_CONTROL` gets empty defaults for the new keys.
  - `getAdminGroups()` derives the new keys from `mobileApp`, publishing only
    `homeLayout.published` and `enabled` custom features to the public payload.

### Mobile (`edutumobile`)

- `lib/appControl.ts` — extend `AppControlConfig` type + `normaliseAppControl`
  with the new keys (fail-open defaults); add `getFeatureFlag()` helper.
- `components/context/AppControlContext.tsx` — add `useFeatureFlag(key)`.
- `lib/homeBlocks.ts` (new) — block + custom-feature types, `normaliseHomeLayout`,
  `normaliseCustomFeatures`.
- `components/home/HomeBlocks.tsx` (new) — the block registry + renderer. Maps
  `type` → component; unknown types skipped; each block wrapped in an error
  boundary. Content-block components (`AnnouncementBlock`, `PromoBannerBlock`,
  `CuratedRailBlock`, `InfoCardBlock`, `WebFeatureBlock`) live here or in
  `components/home/blocks/`.
- `app/(app)/index.tsx` — mount `<HomeBlocks />` in the home ScrollView. When a
  published layout exists it drives the dynamic region; when empty the existing
  layout renders unchanged. Native block types reference existing sections so
  the admin can reorder the dynamic region relative to them.
- `app/(app)/feature/[id].tsx` (new) — `WebFeatureScreen`: themed header + back,
  `react-native-webview` (already a dependency) for `openMode:'webview'`;
  `openMode:'external'` opens the system browser via `expo-linking`/`WebBrowser`.
- Tools/discovery surface renders `customFeatures` with `placement` in
  `('tools','both')` as tiles.

### Admin (`admin/src`)

- `lib/mobileControlApi.ts` / settings API — read + write the new mobileApp keys.
- `pages/MobileControl.tsx` — three new panels:
  - **Home Layout composer**: block list with add / edit-props / reorder /
    remove; Save draft → Publish → Rollback. Publishes `draft` into `published`,
    moving prior `published` into `lastPublished`.
  - **Custom Features**: CRUD table (title, icon, url, openMode, placement,
    enabled).
  - **Feature Flags**: key→boolean toggles.

### EAS Update workflow (docs, no code)

- Set `updates.checkAutomatically: ON_LOAD`; apply on next launch.
- Release flow documented: `eas update --channel production --message "..."`,
  preview channel first. `runtimeVersion` bumped only for native changes.

## Data flow

Admin edits `admin_settings.mobileApp` → stored (Zod-validated) → mobile app
fetches `GET /mobile-control/config` on cold start + foreground → normalised
into `AppControlConfig` → home renders `homeLayout.published` blocks + tools
renders `customFeatures` → `web_feature` / custom-feature tap opens
`feature/[id]` WebView. New native block types / screens ship via EAS Update and
are revealed by admin flags or layout edits.

## Block types (v1)

| type | props | renders |
|------|-------|---------|
| `recommendations` | `{ title? }` | existing reco rail |
| `categories` | `{}` | existing discovery tiles |
| `quick_stats` | `{}` | existing quick-stats row |
| `profile_prompt` | `{}` | existing profile-completion card |
| `announcement` | `{ title, body, accentColor?, ctaLabel?, ctaUrl? }` | dismissible card |
| `promo_banner` | `{ imageUrl, linkUrl?, title? }` | image banner |
| `curated_rail` | `{ title, opportunityIds[] } \| { title, query }` | opportunity rail |
| `info_card` | `{ title, body, icon?, ctaLabel?, ctaUrl? }` | static info card |
| `web_feature` | `{ featureId }` | card that opens a custom feature |

Unknown types render nothing (forward-compatibility for EAS-shipped types).

## Error handling

Fail-open at fetch, parse, and per-block render. Missing config → hardcoded
home. Invalid block → skipped. Bad URL → WebView error state. Admin publish is
atomic on the settings blob (single PUT).

## Testing

- Backend: DTO spec — old blobs still parse; new keys default; malformed
  `homeLayout` rejected without nuking other groups (merge stays lenient).
- Mobile: `normaliseHomeLayout`/`normaliseCustomFeatures` unit tests; HomeBlocks
  renders known types, skips unknown, survives a throwing block; WebFeatureScreen
  handles missing feature id.
- Admin: publish moves draft→published→lastPublished; rollback restores.

## Out of scope (YAGNI)

- Per-cohort / A-B targeting, scheduled publishes, version history table
  (Approach B). Near-instant in-session polling. Web app server-driven UI.

## Non-negotiables recap

1. A bad or empty config renders the current hardcoded home — never a crash.
2. Every new settings key is optional + defaulted (Zod-merge safety).
3. Unknown block types are skipped, not fatal (EAS forward-compat).
4. Draft never leaves the server; only `published` reaches the app.
