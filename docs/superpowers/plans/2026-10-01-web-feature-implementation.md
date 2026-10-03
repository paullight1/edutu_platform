# Edutu web feature implementation — 1 October 2026

Work is on `paul/web-mobile-features` in the existing checkout. Existing dashboard, onboarding, authentication and shell changes were preserved. Changes are uncommitted for review.

## Implemented

- AI Coach: owned conversation history, authenticated streamed replies, cancellation, tool reconciliation and opportunity links.
- Voice Coach: microphone/WebRTC, canonical Coach tool calls, transcripts, mute/end, explicit renewal, paid-plan access, and cleanup on hide/navigation. Closed sessions cannot publish late tool transcripts or stop a newer session.
- CV builder and AI tools: structured sections, complete advanced-content preservation, versions, stale-revision protection, six designs, local health feedback, print/PDF and text exports, AI draft/tailoring/cover letters and LinkedIn-file proposals requiring acceptance.
- My Documents: bounded upload, parsing retry, owned document lists and expiring signed downloads.
- Application Copilot: application kits, fit/eligibility/gaps, atomic checklist updates, editable essay drafts with revision guards, outlines/feedback, reusable answer bank and editable referee-request export.
- Saved searches and matching alerts: create/edit/delete, preview, pause/resume, and push preferences using the existing matching/digest pipeline.
- Goals: CRUD, priority/progress, calendar/date handling, completion/reopening and archive views.
- Wallet: authoritative plan/credit status, configured consumer catalog, history, provider management, idempotent pending-checkout recovery and owner-scoped fulfillment checks. Purchasing remains held at the server.

The CV bridge handles both legacy text Clerk owners and UUID owners resolved through an owned profile's `id` or canonical `user_id`. UUID template names and legacy names map to shared designs. Mobile preview/export honors web template metadata, and selecting a new mobile design updates that metadata. Mobile CVs held only in device storage cannot appear on web until synchronized.

New browser business requests use the NestJS API; AI credentials and database authority remain server-side. Recovery drafts are scoped to owner and record. UI release switches are independent; server authorization, metering and ownership remain authoritative.

## Verification

Focused backend tests: 107 passing across eight suites. Backend build passes after the review fixes.

Focused web tests: 76 passing across 23 files. Web TypeScript and focused ESLint checks pass. The production Vite/PWA build passes; the full build with SEO generation also passed earlier. Mobile template tests: 18 passing, including web-saved and legacy seeded designs. Mobile TypeScript checks pass. The independent reviewer found no remaining P0–P2 issues in the implemented flows after the fixes; the payment release hold remains explicit.

The earlier full web suite reported 581 passing and 10 failing tests in unrelated existing areas: ProfileCompletionPrompt, AuthScreenOtp, landingCountryMarquee, and opportunityShuffle. These failures were not hidden or rewritten for the feature work.

## Remaining release work

1. The NestJS development server is now running at `http://localhost:3010`; readiness and liveness return HTTP 200. The web preview runs at `http://localhost:5174`. OpenRouter is configured; Gemini is missing. Live AI, WebRTC and alert delivery still need provider-backed verification.
2. The hosted payment shell requires single-use code exchange, opaque session handling, owned intent status and account endpoints that are absent from NestJS. Both new consumer checkout and existing hosted checkout are held with 503 before provider calls, independent of browser flags. Implement and verify that protocol plus sandbox webhook/reconciliation flows before allowing purchases.
3. New product copy uses English fallback until reviewed translations are supplied. Existing mobile CV-health translations are reused.
4. Run cross-device tests against both actual database schema layouts and provider sandbox accounts before deployment. Unit fixtures verify ownership/schema behavior; they are not live database integration tests.

No database migrations, deployment, live AI/provider transactions, payment or external messages were performed.

## Navigation and My Plan follow-up

The mobile web navigation now has five tabs: Home, Explore, AI Coach, My Plan and Profile. Coach occupies the center position. CV and AI tools, Application Copilot, My Documents and Goals are accessible from a compact preparation grid in My Plan and share its section navigation. Their routes keep the My Plan tab selected. Saved searches belong to Explore; wallet and settings belong to Profile.

The mobile header provides More with keyboard focus containment, Escape dismissal and focus restoration. Feature titles and direct-entry back destinations match their workspace. Navigation uses links, visible focus states, touch-sized targets and bottom safe-area spacing.

The follow-up verification passed 74 focused web tests across 22 files, TypeScript, focused ESLint and the production Vite/PWA build. The My Plan desktop and 390px phone layouts were inspected with live journey data. A subsequent browser navigation check was interrupted when the preview server stopped; the server was restarted and HTTP 200 confirmed. Browser viewport overrides were reset.
