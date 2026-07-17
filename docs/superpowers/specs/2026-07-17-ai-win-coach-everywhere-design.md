# Edutu AI Win-Coach — Everywhere Assistant Design

Date: 2026-07-17
Status: Approved design (pending spec review) — brainstorming output
Target repo path (blocked by macOS TCC at write time): `docs/superpowers/specs/2026-07-17-ai-win-coach-everywhere-design.md`

## Problem

Edutu's tool-calling AI agent lives in exactly one place: the mobile chat room
(`POST /chat/messages` → `runAgentTurn`, 16 tools, user context in the system
prompt). Every other AI surface (chat-proxy fallback, copilot, CV/SOP endpoints,
quiz, roadmaps) is a single-shot completion with thin or no user data. The web
coach was removed entirely.

The user wants the AI enabled **everywhere, not just the chat room**, reframed
around a concrete goal: **help users win applications.** Concretely, the AI should:

- Be reachable from every screen and know what screen the user is on.
- Track what the user has **applied** to and what **documents were submitted** to
  each application.
- Let users **upload their own documents** (real CVs, transcripts, essays) so the
  AI works from the user's actual materials, not guesses.
- Proactively **nudge** users toward the next winning move (deadlines, missing docs).

## Scope & decisions (from brainstorming)

- **Platforms:** Mobile first; web is a later phase. (Web coach is currently gone.)
- **Shape:** Both a screen-aware global assistant **and** inline AI actions on the
  highest-value screens (staged).
- **Documents:** Full — upload + parse to text + link documents to applications.
- **Proactivity:** Proactive nudges reusing the existing `coach.pulse` /
  opportunity-alert push engine.
- **Architecture:** Approach A — one context-aware agent invoked everywhere (not
  per-action endpoints, not client-composed prompts).
- **Link model:** Dedicated `application_documents` join table.
- **Parse depth:** Full PDF + DOCX + TXT extraction.

## Grounding (live DB schema, pulled 2026-07-17)

- `opportunity_applications(id, user_id text[raw Clerk], opportunity_id uuid,
  status text ['draft'|'submitted' in use], submitted_at, notes, metadata jsonb,
  created_at, updated_at)` — **no document column today.**
- `ai_documents(id, user_id text, type, title, content jsonb, opportunity_id uuid
  null, version, history jsonb, created_at, updated_at)` — AI-generated CV/SOP
  drafts; content is structured JSONB, already optionally linked to an opportunity.
- Storage buckets already provisioned: **`cv-files`** (private, 5 MB, allows
  pdf/msword/docx/odt/txt) and `ai-documents` (private).
- `user_cvs`, `user_ai_memories`, `goals` keyed by `user_id text` (raw Clerk id) —
  same convention; new tables follow it.

## Architecture — Approach A: one context-aware agent

Keep the single agent loop (`chat.service.ts` → `runAgentTurn`, `MAX_TOOL_ROUNDS`).
Generalize it rather than forking per surface.

**New request fields** on `POST /chat/messages` and `/chat/messages/stream`
(all optional; existing callers unaffected):

```
context?: {
  surface: 'opportunity_detail' | 'application_tracker' | 'document' | 'home' | ...
  opportunityId?: string
  applicationId?: string
  documentId?: string      // ai_documents.id
  uploadId?: string        // user_uploads.id
}
intent?: 'free_chat' | 'fit_check' | 'next_move' | 'review_doc' | 'whats_missing'
```

- **`intent` presets** are server-side system-prompt fragments. Inline buttons send
  a tiny payload (`intent` + `context`), never a full prompt — so prompt logic
  evolves server-side without app releases.
- **`buildAgentSystemPrompt`** branches on `context`: when an entity id is present
  it preloads that entity (the opportunity, the application's doc checklist +
  deadline, the document/upload extracted text) in addition to the existing
  profile / goals / in-flight applications / durable memories.
- **Token guard:** when an upload's `extracted_text` is large, truncate/summarize
  before injecting; prefer the `read_document` tool for on-demand full text rather
  than always preloading it.

## Data model changes

### New table: `user_uploads` (user-provided files)

```
id            uuid pk
user_id       text not null          -- raw Clerk id
kind          text not null          -- 'cv' | 'transcript' | 'essay' | 'other'
file_name     text not null
storage_path  text not null          -- path within 'cv-files' bucket
mime_type     text not null
size          integer not null
extracted_text text                  -- populated after ingest
parse_status  text not null          -- 'pending' | 'done' | 'failed'
parse_error   text
opportunity_id uuid                   -- optional soft link
created_at    timestamptz not null default now()
updated_at    timestamptz not null default now()
```

RLS: owner-only by `user_id`. Reuses the existing private `cv-files` bucket.

### New table: `application_documents` (which docs → which application)

```
id             uuid pk
application_id uuid not null          -- → opportunity_applications.id
user_id        text not null          -- raw Clerk id (denormalized for RLS/query)
document_id   uuid                    -- → ai_documents.id (AI-drafted)
upload_id     uuid                    -- → user_uploads.id (user-provided)
role           text not null          -- 'cv' | 'sop' | 'transcript' | 'other'
status         text not null          -- 'missing' | 'draft' | 'submitted'
submitted_at   timestamptz
created_at     timestamptz not null default now()
```

Exactly one of `document_id` / `upload_id` set per row (a checklist item may also
be `missing` with neither set). The per-application **required-docs checklist** is
derived from these rows. RLS owner-only.

## New agent tools (added to the existing registry; same definition + Zod execute pattern)

- `list_applications` — user's tracked applications with per-app doc completeness
  and deadline.
- `get_application_status` — one application's checklist, deadline, computed next
  action.
- `read_document` — returns `extracted_text` (uploads) or rendered `content`
  (`ai_documents`) so the model reasons over the **real** text.
- `link_document_to_application` — attach an upload or ai_document to an application
  under a role.
- `mark_submitted` — set an `application_documents` row to `submitted` (+ timestamp)
  and, when appropriate, flip `opportunity_applications.status` to `submitted`.
- `analyze_fit` — opportunity requirements vs. the user's real profile + uploaded
  docs; returns strengths, gaps, and recommended next actions. (Credit-metered.)

Tools follow the existing `coach-tools.service.ts` pattern: a definition schema in
`getDefinitions()` and a Zod-validated case in `execute()`, with results emitted
through the existing `CoachToolContext` sinks (cards / buttons / documents).

## Document upload + parse flow

1. Mobile requests a signed upload URL: `POST /uploads` → creates a `user_uploads`
   row (`parse_status='pending'`) and returns a signed PUT URL into `cv-files`.
2. Mobile uploads the file directly to Storage.
3. Mobile calls `POST /uploads/:id/ingest`.
4. Backend downloads the object and extracts text:
   - PDF → `pdf-parse`
   - DOCX → `mammoth`
   - TXT → plain read
   Stores `extracted_text`, sets `parse_status='done'` (or `'failed'` + `parse_error`).
5. `extracted_text` becomes what `read_document` / the agent context serves.

New backend deps on Render: `pdf-parse`, `mammoth`. Parsing is credit-metered via
`MonetizationService` like other paid operations.

## Proactive nudges

Extend the existing `coach.pulse` / `alerts/opportunity-alerts.service.ts` scan:
for each application the user intends to submit, with an approaching deadline and an
**incomplete** `application_documents` checklist, generate a nudge via the existing
push pipeline (respecting quiet hours):

> "Chevening closes in 5 days — your SOP is still a draft. Want me to finish it?"

Dedupe per application/nudge-type; do not re-nudge a completed checklist.

## Mobile experience

- **`<AiActionBar>`** — reusable inline action component. Buttons fire the agent with
  `intent` + screen `context`; results render in a lightweight sheet reusing the
  chat message/card renderer.
  - Opportunity detail: "Am I a fit?" (`fit_check`), "Next move" (`next_move`).
  - Application tracker: per-app "What's missing?" (`whats_missing`), "Prep me."
  - Document / upload view: "Review this" (`review_doc`).
- **Floating assistant** — global entry point (reusing the existing nav-circle / FAB
  pattern) on every screen; opens chat with current screen context prefilled.
- **Upload UI** — `expo-document-picker` on the documents screen and inline on an
  application ("attach the CV you submitted"), with parse-status feedback.

## Rollout & flags

- Gate behind `AI_WINCOACH_ENABLED` (mirrors `AI_AGENT_ENABLED`), fail-safe off.
- Order: (1) tables + backend tools + context-aware agent; (2) upload + parse;
  (3) inline actions + floating assistant; (4) proactive nudges.
- Metering: `analyze_fit` and upload parsing route through `MonetizationService`.

## Error handling

- Upload parse failure → `parse_status='failed'`, surfaced in UI; the file is still
  stored and the user can retry ingest.
- Missing/oversized/unsupported file → rejected at signed-URL step using the
  `cv-files` bucket's existing mime/size constraints.
- Agent context references a deleted entity → context builder skips it gracefully
  (fail-open to free_chat), never hard-errors the turn.
- New tables/tools absent or flag off → agent behaves exactly as today.

## Testing

- Unit: text extraction against fixture PDF/DOCX/TXT; checklist-derivation logic;
  each new tool's `execute` path (Zod validation + happy/edge cases).
- Integration: an agent turn with `context` asserts the preloaded system-prompt data
  changes; `analyze_fit` end-to-end with a fixture upload.
- Proactive scan: nudges fire only for incomplete + near-deadline applications, and
  never twice for the same state.

## Out of scope (this spec)

- Web AI surface (deferred phase).
- Non-application document use cases (general writing assistant beyond winning apps).
- Streaming to inline actions (they can use the existing non-streaming turn first).
```
