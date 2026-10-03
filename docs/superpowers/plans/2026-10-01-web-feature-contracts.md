# Web feature contracts and local verification

## Architecture and identities

All new browser business requests use the Clerk-authenticated NestJS backend at `backend/services/services/api`. There are no new browser Supabase clients or public AI keys. Existing local changes to onboarding/dashboard/shell were preserved in `paul/web-mobile-features`.

- Coach, goals, copilot, uploads and metering use `CurrentUser('id')`, the canonical derived database principal. Existing services enforce ownership.
- Structured mobile CVs receive `CurrentUser('authId')`. The bridge probes legacy text ownership and, for UUID FK installs, resolves `profiles.id` or the backend’s UUID `profiles.user_id` only from a profile whose `user_id` matches the authenticated raw or derived identity. Missing profiles fail closed. No destructive migration is run here. CVs stored only in mobile AsyncStorage remain on that device until mobile synchronizes them.
- Learner checkout, catalog and intent status use raw Clerk billing identity. `getOwnedIntent` includes both intent ID and owner; a guessed checkout ID cannot expose another user's record.

## Operations

| Surface | Contract | Persistence / recovery |
|---|---|---|
| Text coach | Authenticated POST `/chat/messages/stream`, thread/message GETs, DELETE thread | Final SSE message is authoritative. Tool preambles are cleared. Incomplete streams fail visibly; no automatic replay. Input is retained on ambiguous failure. |
| Voice | POST `/voice/realtime/session`, SDP + supported voice + locale | Explicit start, browser microphone/WebRTC, `ask_edutu` bridges canonical chat. Stops tracks, channels and peer on end, hide or navigation. Reservation expiry ends session; user explicitly continues. Paid tier required; credits cannot independently unlock voice. |
| Structured CV | `/cv/editor` GET/POST and GET/PATCH/DELETE by ID | Backend bridge to `user_cvs`, preserving all JSON sections and unknown fields. PATCH requires matching `expectedUpdatedAt`; atomic owner+revision comparison returns 409 on conflict. Render slug is stored in `_edutuTemplateSlug`; UUID template FK is never filled with a slug. Known UUID template names resolve to shipped designs, and mobile preview/export honors the metadata. |
| CV AI | Existing `/cv/ai/draft`, `/tailor`, `/cover-letter`, `/import-linkedin-file` | AI and imported drafts are proposals until accepted. `tailored_cv` response is honored. Original JSON preserved; unsupported sections are retained. Local deterministic health check, escaped HTML print preview, browser Print / Save PDF and complete text export. |
| Documents | POST `/uploads/file` multipart then `/uploads/:id/ingest`, GET list/download URL | Backend bounded 10 MB upload, MIME/kind checks, owner storage path. Storage removed if metadata insert fails. Original persists through parsing failures. Downloads are signed for 300 seconds. CV and legacy web origins are separately labeled. |
| Copilot | Existing kits, checklist, answers, outline, feedback and essay endpoints | Essays include expected revision. AI assistance also compares the revision to avoid writing an old draft over a newer one. Checklist key updates merge/remove atomically in PostgreSQL, scoped to owner and kit. Checklist is separate from My Plan and submission status. Referee email is editable/exportable; never sent automatically. |
| Saved searches | query/category/fundingType/targetRegion/remoteOnly/name/notifyEnabled | Existing server matching/digest pipeline. Preview, pause/resume, edit/delete. Server default digest tick 30 min; push cooldown defaults six hours and respects preferences/quiet hours. These timings are deployment-configurable. Sorting/open-closed display filters are not saved criteria. |
| Goals | Existing strict goal DTO and CRUD | List/calendar, local-noon target-date serialization, progress, complete/reopen/archive/delete. Existing backend owns reminder/calendar workflows. No inferred completion of opportunity journeys. |
| Access | GET `/monetization/access`, GET `/billing/status` | Read-only costs, tier-specific chat/action/voice remaining, reset timestamp, new-account chat grace. Unavailable never means free. Server meters every actual AI operation. |
| Wallet | GET `/billing/user-catalog`, POST `/billing/consumer-checkout`, GET `/billing/intents/:id`, billing portal | Mapped consumer products are shown, but consumer checkout is server-disabled until hosted payment completion is implemented. API developer packs excluded. One client UUID is retained across uncertain checkout retries. Polling bounded to 12 checks. Only canonical `fulfilled` means completed; redirect or `paid` alone is insufficient. |

## Money and retries

Existing API-branded credit purchase and AI spending use the established profile credit/ledger path. No separate balance or new prices are invented. Developer catalog `/billing/catalog` remains restricted to active developer accounts; learner wallet uses additive `/billing/user-catalog`.

Catalog prices are integer minor currency units; history returned by billing status is normalized to major units. Recurring versus one-time access, cadence and duration come from configured products. Provider origin checks remain strict. No live checkout, provider transaction, entitlement grant or database migration was executed.

GET/HEAD requests can retry transient errors. Mutations make one attempt; checkout has its existing server idempotency contract. Streams never fall back to another metered request. Requests preserve HTTP status/error code, cancellation, multipart boundaries and bounded timeouts.

## Release and private state

`VITE_DISABLED_WORKSPACE_FEATURES` is a comma-separated list of independent UI switches: `coach,voice,cv,copilot,documents,saved-searches,goals,wallet`. Server ownership/metering/provider switches remain authoritative. Pages remain protected by Clerk. Account/path changes remount private feature state. Billing cache is invalidated on account change.

CV and essay recovery copies live in sessionStorage keyed by owner + record/prompt. Link navigation and closing the tab warn on unsaved changes; back/navigation recovery is offered when the page is reopened. Recovery has no server or service-worker write. Checkout recovery metadata lives in owner-keyed localStorage, and carries no credentials or authority to fulfill payment.

## Verification boundaries

Unit/component tests use synthetic owned records, full advanced CV sections, stale revisions, fake RTC/media, stream chunking and fake billing repositories. The running localhost preview renders the new navigation and CV health/editor; its configured backend requests return `Failed to fetch`, so live persistence, Gemini, WebRTC provider and payment processing cannot be verified through this session. These require an available backend and configured test accounts before release.

English copy is externalized, and existing mobile CV-health translations are reused for supported locales. Newly introduced product copy uses English fallback until human translations are supplied.

## Payment release prerequisite

`pay-edutu-org` requires single-use pay-shell code exchange, opaque billing sessions, owner-scoped `/billing/intent-status`, and `/billing/account`. These NestJS endpoints are absent. The learner catalog therefore reports `checkoutEnabled: false`, and the dedicated consumer checkout endpoint returns 503 before any provider call. The existing hosted `/billing/checkout` path is also held before its provider call, covering older upgrade and developer callers. Complete the hosted protocol and sandbox success/cancel/webhook reconciliation checks before enabling learner purchases.
