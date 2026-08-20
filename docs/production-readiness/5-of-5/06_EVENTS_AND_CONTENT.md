# Events & Public Content 5/5 Implementation Plan

**Goal:** make public content trustworthy, operationally safe, measurable and resilient to abuse.

**Primary files:** events web components and backend `events/`; `BlogPage.tsx`, `BlogPostPage.tsx`, backend `blog/`, impact/public content components and admin content pages.

## Feature 11 — Events

### 5/5 acceptance criteria

- Public event data is complete, timezone-correct and shareable.
- RSVP/capacity/waitlist state is authoritative and race-safe where events require registration.
- Calendar export and reminders work across timezone/DST boundaries.
- Admin changes are audited and publication state is clear.

### Tasks

- [ ] **F11-T1 — Event schema completeness.** Standardize timezone, start/end, venue/remote URL, organizer, capacity, registration URL/state, visibility, publication and cancellation fields.
- [ ] **F11-T2 — RSVP model.** If RSVP is in scope, implement atomic capacity enforcement, waitlist promotion and duplicate prevention; otherwise explicitly route users to the official external registration and do not imply an Edutu RSVP.
- [ ] **F11-T3 — Calendar/reminders.** Generate standards-compliant ICS, preserve timezone and send reminder events through the canonical notification service.
- [ ] **F11-T4 — Cancellation/change UX.** Surface changed/cancelled events, notify affected users and preserve audit history.
- [ ] **F11-T5 — SEO/share.** Verify OG metadata, canonical URLs and sitemap behavior for event detail routes.
- [ ] **F11-T6 — Performance/analytics.** Paginate event lists and record view, register/RSVP, calendar-add and attendance/outcome events where available.

### Required tests

Timezone/DST fixtures, capacity concurrency, cancellation notification, OG route, browser list→detail→calendar/register journey.

## Feature 12 — Blog & Public Content

### 5/5 acceptance criteria

- Public comments/likes cannot be cheaply spammed or manipulated.
- Uploads are size/type/content validated and unsafe formats handled safely.
- Database failures produce observable errors, not silent empty states.
- Published claims, impact metrics and testimonials have provenance/approval.
- Content editing, moderation and publication are auditable.

### Tasks

- [ ] **F12-T1 — Harden public engagement.** Add endpoint-specific throttles, bot challenge or authenticated identity where appropriate, duplicate-like prevention strategy and comment abuse controls.
- [ ] **F12-T2 — Comment moderation.** Default new comments to pending where policy requires; add spam/report state, moderator history and rate-limit metrics.
- [ ] **F12-T3 — Upload hardening.** Add max byte size, decoded image dimension limits, magic-byte detection, safe extension generation and reject or sanitize SVG unless a safe rasterization path is used.
- [ ] **F12-T4 — Error semantics.** Stop returning `[]` for unexpected DB failures in public list/category methods; emit typed errors, structured logs and safe UI retry states.
- [ ] **F12-T5 — Trust registry.** Store owner/source/last-verified metadata for public impact statistics and testimonials; require editorial approval for externally visible claims.
- [ ] **F12-T6 — Content workflow.** Draft/preview/scheduled/published/archived lifecycle, preview token, revision history and rollback to prior revision.
- [ ] **F12-T7 — SEO/accessibility/performance.** Validate headings, images/alt text, structured metadata, reading layout, lazy media and Core Web Vitals.

### Required tests

Spam/rate-limit tests, upload fake-MIME/oversize tests, DB-failure response tests, moderation authorization, revision/rollback, SEO snapshots and public browser journeys.

## Exit evidence

5/5 requires real abuse resistance and truthful public claims. A visually complete content page with synthetic metrics is not production-complete.
