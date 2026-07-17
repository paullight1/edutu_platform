# AI Win-Coach Everywhere — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Edutu's tool-calling AI agent available across the whole app (not just the chat room) as a win-focused co-pilot that knows the current screen, tracks what the user applied to and which documents were submitted, reads the user's own uploaded documents, and proactively nudges the next winning move.

**Architecture:** Approach A — one context-aware agent. The existing agent loop (`chat.service.ts` → `runAgentTurn`) is generalized to accept an optional `context` (surface + entity ids) and `intent` preset; `buildAgentSystemPrompt` preloads the relevant entity. Inline actions and a global floating assistant call the same `POST /chat/messages` endpoint. New capabilities are added as: two Supabase tables (`user_uploads`, `application_documents`), an uploads/parse module, six new coach tools, and an extension of the existing alert engine for proactive nudges.

**Tech Stack:** NestJS + Drizzle + Supabase (Postgres + Storage) backend (`backend/services/services/api`); Expo/React Native mobile (`edutumobile`); DeepSeek via `AiService` for generation; Jest for backend tests, existing mobile test setup for RN.

## Global Constraints

- Backend lives in `backend/services/services/api/src` — **NOT** `_archive/edutuengineapi` (deprecated, do not touch).
- New feature gated behind `AI_WINCOACH_ENABLED` (env, defaults ON unless `=false`), mirroring `AI_AGENT_ENABLED` in `chat.service.ts:151`.
- User id everywhere is the **raw Clerk id as `text`** (`user_id text`), matching `opportunity_applications`, `goals`, `user_ai_memories`, `ai_documents`, `user_cvs`.
- Migrations: `backend/services/services/api/supabase/migrations/YYYYMMDDHHMMSS_<name>.sql`; lead with a WHY comment; `grant ... to authenticated;` and `grant ... to service_role;` on any new function; enable RLS + owner-only policies on new tables.
- **Reuse existing monetization meter keys** (`cvAi`, `copilotAssist`, `roadmapGeneration`, `chatMessage`) — do NOT add new meter keys in this plan (admin_settings writes must fit the existing Zod schema or ALL settings silently fall back to defaults — see memory `payments-pay-edutu-org-2026-07`).
- Backend lint is a real CI gate at `--max-warnings 0` (memory `backend-lint-real-check-2026-07-14`). Run `npm run lint` in the api package before every commit.
- Node 20 everywhere — do not bump (memory `ci-green-up-2026-07-14`).
- Application status values in use are only `draft` and `submitted`. `application_documents.status` uses `missing | draft | submitted`.
- New agent tools follow the exact `CoachTool` pattern in `chat/tools/coach-tools.service.ts`: a private method returning `{ name, description, parameters (hand JSON Schema), schema (Zod), execute }`, registered in the `this.tools = [...]` array, dispatched by the generic `execute()`.
- Storage: reuse the existing private **`cv-files`** bucket (5 MB, allows pdf/msword/docx/odt/txt) for user uploads. Use the service-role Supabase client (as `chat.service.ts` builds it).

---

## Phase 1 — Data model foundation

### Task 1: `user_uploads` + `application_documents` tables (migration + RLS)

**Files:**
- Create: `backend/services/services/api/supabase/migrations/20260717120000_win_coach_documents.sql`

**Interfaces:**
- Produces: tables `public.user_uploads`, `public.application_documents` with the columns below; later Drizzle tasks map to these exact snake_case names.

- [ ] **Step 1: Write the migration**

```sql
-- Win-Coach: user-provided documents + which documents were submitted to which
-- application. opportunity_applications has no doc columns today, and ai_documents
-- only holds AI-generated drafts (jsonb), so both are new.

create table if not exists public.user_uploads (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,
  kind           text not null default 'other',      -- cv | transcript | essay | other
  file_name      text not null,
  storage_path   text not null,                       -- path within the 'cv-files' bucket
  mime_type      text not null,
  size           integer not null default 0,
  extracted_text text,
  parse_status   text not null default 'pending',     -- pending | done | failed
  parse_error    text,
  opportunity_id uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists user_uploads_user_idx on public.user_uploads (user_id, created_at desc);

create table if not exists public.application_documents (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.opportunity_applications (id) on delete cascade,
  user_id        text not null,
  document_id    uuid references public.ai_documents (id) on delete set null,
  upload_id      uuid references public.user_uploads (id) on delete set null,
  role           text not null default 'other',       -- cv | sop | transcript | other
  status         text not null default 'missing',     -- missing | draft | submitted
  submitted_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists application_documents_app_idx on public.application_documents (application_id);
create index if not exists application_documents_user_idx on public.application_documents (user_id);

alter table public.user_uploads enable row level security;
alter table public.application_documents enable row level security;

-- Backend uses the service-role key (bypasses RLS); these policies exist so a
-- future direct-from-client read stays owner-scoped. auth.jwt()->>'sub' is the
-- Clerk id, matching the text user_id convention.
create policy user_uploads_owner on public.user_uploads
  for all using (user_id = auth.jwt()->>'sub') with check (user_id = auth.jwt()->>'sub');
create policy application_documents_owner on public.application_documents
  for all using (user_id = auth.jwt()->>'sub') with check (user_id = auth.jwt()->>'sub');

grant select, insert, update, delete on public.user_uploads to authenticated, service_role;
grant select, insert, update, delete on public.application_documents to authenticated, service_role;
```

- [ ] **Step 2: Apply the migration** (via the project's migration runner or Supabase MCP `apply_migration`). Expected: both tables exist. Verify:

Run: `psql "$DATABASE_URL" -c "\d public.user_uploads" -c "\d public.application_documents"`
Expected: column lists match the migration.

- [ ] **Step 3: Commit**

```bash
git add backend/services/services/api/supabase/migrations/20260717120000_win_coach_documents.sql
git commit -m "feat(db): user_uploads + application_documents tables for win-coach"
```

### Task 2: Drizzle schema entries

**Files:**
- Modify: `backend/services/services/api/src/db/schema.ts` (append two `pgTable` definitions next to `userAiMemories`)

**Interfaces:**
- Consumes: table shapes from Task 1.
- Produces: exported `userUploads`, `applicationDocuments` Drizzle tables used by Tasks 4–9.

- [ ] **Step 1: Read the existing `userAiMemories` pgTable** in `schema.ts` to copy the column-mapping idiom (camelCase field → snake_case column, `text()`, `uuid().defaultRandom()`, `timestamp(..., { withTimezone: true })`).

- [ ] **Step 2: Add the tables** (match the file's existing import of `pgTable, text, uuid, integer, timestamp`):

```ts
export const userUploads = pgTable("user_uploads", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull().default("other"),
  fileName: text("file_name").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull().default(0),
  extractedText: text("extracted_text"),
  parseStatus: text("parse_status").notNull().default("pending"),
  parseError: text("parse_error"),
  opportunityId: uuid("opportunity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const applicationDocuments = pgTable("application_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id").notNull(),
  userId: text("user_id").notNull(),
  documentId: uuid("document_id"),
  uploadId: uuid("upload_id"),
  role: text("role").notNull().default("other"),
  status: text("status").notNull().default("missing"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Typecheck**

Run: `cd backend/services/services/api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add backend/services/services/api/src/db/schema.ts
git commit -m "feat(db): drizzle entries for user_uploads + application_documents"
```

---

## Phase 2 — Application-documents service + checklist logic

### Task 3: `ApplicationDocumentsService` (checklist derivation)

**Files:**
- Create: `backend/services/services/api/src/applications/application-documents.service.ts`
- Create: `backend/services/services/api/src/applications/application-documents.module.ts`
- Test: `backend/services/services/api/src/applications/application-documents.service.spec.ts`

**Interfaces:**
- Produces:
  - `listForUser(userId: string): Promise<AppWithDocs[]>` where `AppWithDocs = { applicationId: string; opportunityId: string; opportunityTitle: string; status: string; deadline: string | null; docs: DocRow[]; missingRoles: string[] }`
  - `getStatus(userId: string, applicationId: string): Promise<AppWithDocs | null>`
  - `linkDocument(userId, { applicationId, role, documentId?, uploadId? }): Promise<DocRow>`
  - `markSubmitted(userId, { applicationId, role }): Promise<DocRow>` — sets that row `status='submitted'`, `submitted_at=now()`; if all `REQUIRED_ROLES` are submitted, flips `opportunity_applications.status='submitted'`.
  - Exported const `REQUIRED_ROLES = ["cv", "sop"] as const`.
  - `DocRow = { id: string; role: string; status: string; documentId: string | null; uploadId: string | null; submittedAt: string | null }`

- [ ] **Step 1: Write the failing test** (uses a Supabase mock — follow the `createClient` mock idiom from existing `*.spec.ts`, memory `ci-green-up-2026-07-14`):

```ts
import { deriveMissingRoles, REQUIRED_ROLES } from "./application-documents.service";

describe("deriveMissingRoles", () => {
  it("reports required roles that have no submitted/draft doc", () => {
    expect(deriveMissingRoles([{ role: "cv", status: "submitted" }])).toEqual(["sop"]);
  });
  it("is empty when every required role is present", () => {
    const rows = REQUIRED_ROLES.map((role) => ({ role, status: "draft" }));
    expect(deriveMissingRoles(rows)).toEqual([]);
  });
  it("ignores non-required roles", () => {
    expect(deriveMissingRoles([{ role: "transcript", status: "submitted" }]).sort())
      .toEqual([...REQUIRED_ROLES].sort());
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend/services/services/api && npx jest application-documents --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service.** Export the pure helper first so the test above passes; wrap DB access in the injectable:

```ts
import { Injectable } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const REQUIRED_ROLES = ["cv", "sop"] as const;

export function deriveMissingRoles(
  docs: Array<{ role: string; status: string }>,
): string[] {
  const present = new Set(
    docs.filter((d) => d.status !== "missing").map((d) => d.role),
  );
  return REQUIRED_ROLES.filter((role) => !present.has(role));
}

@Injectable()
export class ApplicationDocumentsService {
  private readonly supabase: SupabaseClient;
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false } },
    );
  }
  // listForUser / getStatus / linkDocument / markSubmitted per the Interfaces
  // block. listForUser joins opportunity_applications →
  // opportunity:opportunities(id,title,close_date,deadline) and
  // application_documents; computes missingRoles via deriveMissingRoles.
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd backend/services/services/api && npx jest application-documents --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Wire the module** (`ApplicationDocumentsModule` providing+exporting the service) and import it where `CoachToolsService` is provided (the `ChatModule`), so Task 6 can inject it.

- [ ] **Step 6: Lint + commit**

```bash
cd backend/services/services/api && npm run lint
git add backend/services/services/api/src/applications
git commit -m "feat(applications): application-documents service + checklist derivation"
```

---

## Phase 3 — Document upload + parse

### Task 4: Text extraction utility (pdf/docx/txt)

**Files:**
- Create: `backend/services/services/api/src/uploads/extract-text.ts`
- Test: `backend/services/services/api/src/uploads/extract-text.spec.ts`
- Test fixtures: `backend/services/services/api/src/uploads/__fixtures__/sample.pdf`, `sample.docx`, `sample.txt`
- Modify: `backend/services/services/api/package.json` (add `pdf-parse`, `mammoth`)

**Interfaces:**
- Produces: `extractText(buffer: Buffer, mimeType: string): Promise<string>` — returns plain text, throws `UnsupportedMediaTypeException` for unknown mime.

- [ ] **Step 1: Add deps**

Run: `cd backend/services/services/api && npm install pdf-parse mammoth && npm install -D @types/pdf-parse`
Expected: added to package.json.

- [ ] **Step 2: Write the failing test**

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { extractText } from "./extract-text";

const fx = (name: string) => readFileSync(join(__dirname, "__fixtures__", name));

describe("extractText", () => {
  it("reads plain text", async () => {
    expect(await extractText(fx("sample.txt"), "text/plain")).toContain("hello");
  });
  it("reads a docx", async () => {
    const out = await extractText(
      fx("sample.docx"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(out.toLowerCase()).toContain("curriculum");
  });
  it("rejects unknown types", async () => {
    await expect(extractText(Buffer.from(""), "image/png")).rejects.toThrow();
  });
});
```

Create fixtures: `sample.txt` containing `hello world`; a minimal `sample.docx` with the word "Curriculum"; a `sample.pdf` with any text (generate with a one-off script or a checked-in tiny file).

- [ ] **Step 3: Run it, verify it fails**

Run: `cd backend/services/services/api && npx jest extract-text --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
import { UnsupportedMediaTypeException } from "@nestjs/common";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") return (await pdfParse(buffer)).text.trim();
  if (mimeType === DOCX || mimeType === "application/msword") {
    return (await mammoth.extractRawText({ buffer })).value.trim();
  }
  if (mimeType === "text/plain") return buffer.toString("utf8").trim();
  throw new UnsupportedMediaTypeException(`Unsupported document type: ${mimeType}`);
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd backend/services/services/api && npx jest extract-text --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Lint + commit**

```bash
cd backend/services/services/api && npm run lint
git add backend/services/services/api/src/uploads backend/services/services/api/package.json backend/services/services/api/package-lock.json
git commit -m "feat(uploads): pdf/docx/txt text extraction utility"
```

### Task 5: Uploads module (signed URL + ingest)

**Files:**
- Create: `backend/services/services/api/src/uploads/uploads.service.ts`
- Create: `backend/services/services/api/src/uploads/uploads.controller.ts`
- Create: `backend/services/services/api/src/uploads/uploads.module.ts`
- Test: `backend/services/services/api/src/uploads/uploads.service.spec.ts`
- Modify: `backend/services/services/api/src/app.module.ts` (register `UploadsModule`)

**Interfaces:**
- Produces HTTP:
  - `POST /uploads` body `{ fileName, mimeType, kind?, opportunityId? }` → creates a `user_uploads` row (`parse_status='pending'`), returns `{ uploadId, uploadUrl, storagePath }` where `uploadUrl` is a Supabase signed **upload** URL into `cv-files`.
  - `POST /uploads/:id/ingest` → downloads the object, runs `extractText`, stores `extracted_text` + `parse_status`, returns `{ uploadId, parseStatus, chars }`. Metered with existing `copilotAssist` key; refunded on failure.
  - `GET /uploads` → the user's uploads (id, kind, fileName, parseStatus, createdAt).
- Produces service method used by Task 6's `read_document` tool: `getExtractedText(userId, uploadId): Promise<{ fileName: string; text: string; parseStatus: string } | null>`.

- [ ] **Step 1: Write the failing test** — `ingest` on an upload whose stored object is a txt sets `parseStatus='done'` and stores text (mock the storage `.download()` to return the fixture buffer, mock `extractText` or use the real one on a txt buffer).

```ts
it("ingest extracts text and marks done", async () => {
  const svc = makeService(); // supabase mock: download → txt buffer; update spy
  const res = await svc.ingest("user_1", "up_1");
  expect(res.parseStatus).toBe("done");
  expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ parse_status: "done" }));
});
```

- [ ] **Step 2: Run it, verify fail.** Run: `cd backend/services/services/api && npx jest uploads.service --maxWorkers=2` → FAIL.

- [ ] **Step 3: Implement `uploads.service.ts`** using the service-role Supabase client. `createSignedUploadUrl`: `supabase.storage.from("cv-files").createSignedUploadUrl(storagePath)` where `storagePath = \`${userId}/${uuid}-${safeName}\``. `ingest`: `download(storagePath)` → `extractText` → `update user_uploads`. Reject mime types not in the bucket's allow-list before creating the row.

- [ ] **Step 4: Implement the controller** (mirror `chat.controller.ts`: `@CurrentUser("id") userId`, `@AiMetered("copilotAssist")` on `ingest`).

- [ ] **Step 5: Run tests, verify pass.** Same jest command → PASS.

- [ ] **Step 6: Lint + commit**

```bash
cd backend/services/services/api && npm run lint
git add backend/services/services/api/src/uploads backend/services/services/api/src/app.module.ts
git commit -m "feat(uploads): signed-url upload + ingest/parse endpoints"
```

---

## Phase 4 — New coach tools + context-aware agent

### Task 6: Six new coach tools

**Files:**
- Modify: `backend/services/services/api/src/chat/tools/coach-tools.service.ts`
- Modify: `backend/services/services/api/src/chat/tools/coach-tool.types.ts` (add an `ApplicationCard` collect sink if surfacing application cards; otherwise tools return JSON only)
- Test: `backend/services/services/api/src/chat/tools/coach-tools.winning.spec.ts`

**Interfaces:**
- Consumes: `ApplicationDocumentsService` (Task 3), `UploadsService` (Task 5), `DocumentsService.get` (existing).
- Produces: six tools registered in the `this.tools = [...]` array (`chat/tools/coach-tools.service.ts:59`): `list_applications`, `get_application_status`, `read_document`, `link_document_to_application`, `mark_submitted`, `analyze_fit`.

- [ ] **Step 1: Inject the new services** into `CoachToolsService`'s constructor (add `applicationDocs: ApplicationDocumentsService`, `uploads: UploadsService`) and add the six methods to the `this.tools` array.

- [ ] **Step 2: Write the failing test** for the two purely-logical tools' schema validation and dispatch (the DB paths are covered by Task 3/5 services):

```ts
it("mark_submitted rejects a non-uuid application_id", async () => {
  const out = await service.execute("mark_submitted",
    JSON.stringify({ application_id: "nope", role: "cv" }), ctx);
  expect(out).toContain("Invalid arguments");
});
it("analyze_fit is registered with a description mentioning fit", () => {
  const def = service.getDefinitions().find((t) => t.name === "analyze_fit");
  expect(def?.description.toLowerCase()).toContain("fit");
});
```

- [ ] **Step 3: Run it, verify fail.** Run: `cd backend/services/services/api && npx jest coach-tools.winning --maxWorkers=2` → FAIL.

- [ ] **Step 4: Implement the tools.** Representative — `list_applications`, `mark_submitted`, and `analyze_fit` (the others follow the same shape):

```ts
private listApplications(): CoachTool<Record<string, unknown>> {
  return {
    name: "list_applications",
    description:
      "The user's tracked applications with per-application document completeness and deadline. Use for 'what have I applied to', 'what's left', or before advising next steps.",
    parameters: { type: "object", properties: {} },
    schema: z.object({}).passthrough(),
    execute: async (ctx) => ({ applications: await this.applicationDocs.listForUser(ctx.userId) }),
  };
}

private markSubmitted(): CoachTool<{ application_id: string; role: string }> {
  return {
    name: "mark_submitted",
    description:
      "Record that the user submitted a document (by role: cv, sop, transcript, other) to one of their applications. When every required document is submitted the application is marked submitted.",
    parameters: {
      type: "object",
      properties: {
        application_id: { type: "string" },
        role: { type: "string", enum: ["cv", "sop", "transcript", "other"] },
      },
      required: ["application_id", "role"],
    },
    schema: z.object({
      application_id: z.string().uuid(),
      role: z.enum(["cv", "sop", "transcript", "other"]),
    }),
    execute: async (ctx, args) =>
      this.applicationDocs.markSubmitted(ctx.userId, {
        applicationId: args.application_id,
        role: args.role,
      }),
  };
}

private analyzeFit(): CoachTool<{ opportunity_id: string; upload_id?: string }> {
  return {
    name: "analyze_fit",
    description:
      "Analyze how well this user fits an opportunity — compares the opportunity's requirements against the user's profile and (if given) an uploaded document (real CV/essay). Returns strengths, gaps, and concrete next actions to become competitive. Costs credits — confirm first.",
    parameters: {
      type: "object",
      properties: {
        opportunity_id: { type: "string" },
        upload_id: { type: "string", description: "An uploaded doc to ground the analysis in the user's real materials" },
      },
      required: ["opportunity_id"],
    },
    schema: z.object({
      opportunity_id: z.string().uuid(),
      upload_id: z.string().uuid().optional(),
    }),
    execute: async (ctx, args) => {
      const charge = await this.monetizationService.meter(ctx.userId, "copilotAssist");
      try {
        const { data: opp } = await ctx.supabase
          .from("opportunities")
          .select("title, organization, category, requirements, eligibility, skills")
          .eq("id", args.opportunity_id).maybeSingle();
        if (!opp) return { error: "Opportunity not found" };
        const uploadText = args.upload_id
          ? (await this.uploads.getExtractedText(ctx.userId, args.upload_id))?.text ?? ""
          : "";
        const { data: profile } = await ctx.supabase
          .from("profiles")
          .select("country, major, degree, interests, skills")
          .eq("user_id", ctx.userId).maybeSingle();
        const analysis = await this.aiServiceGenerateFit(opp, profile, uploadText); // uses aiService.generateJson, feature "copilot.kit"
        return analysis; // { strengths: string[], gaps: string[], nextActions: string[] }
      } catch (error) {
        await this.monetizationService.refund(charge);
        throw error;
      }
    },
  };
}
```

`analyze_fit` needs an `AiService` reference — inject `AiService` into `CoachToolsService` and add a private `aiServiceGenerateFit(...)` that calls `this.aiService.generateJson({ feature: "copilot.kit", ... })` with a strict JSON prompt (strengths/gaps/nextActions, grounded ONLY in provided data, no fabrication). `read_document` calls `this.uploads.getExtractedText` (uploads) or `this.documentsService.get` (ai_documents) and returns the text, truncated to ~6000 chars. `link_document_to_application` calls `this.applicationDocs.linkDocument`. `get_application_status` calls `this.applicationDocs.getStatus`.

- [ ] **Step 5: Register the tools** in the `this.tools = [...]` array and confirm `getDefinitions()` returns 22 tools.

- [ ] **Step 6: Run tests, verify pass.** Same jest command → PASS.

- [ ] **Step 7: Update the persona** in `chat.service.ts` `DEFAULT_AGENT_PERSONA` (`chat.service.ts:92`) with two lines telling the model it can track applications/documents and analyze fit, and to proactively point out missing required documents.

- [ ] **Step 8: Lint + commit**

```bash
cd backend/services/services/api && npm run lint
git add backend/services/services/api/src/chat
git commit -m "feat(chat): win-coach tools — applications, documents, analyze_fit"
```

### Task 7: Context-aware agent turn + intent presets

**Files:**
- Modify: `backend/services/services/api/src/chat/chat.controller.ts` (accept `context`, `intent` on both endpoints)
- Modify: `backend/services/services/api/src/chat/chat.service.ts` (`sendMessage`, `runAgentTurn`, `buildAgentSystemPrompt`)
- Test: `backend/services/services/api/src/chat/chat.context.spec.ts`

**Interfaces:**
- Consumes: request body gains `context?: { surface?: string; opportunityId?: string; applicationId?: string; documentId?: string; uploadId?: string }` and `intent?: "free_chat" | "fit_check" | "next_move" | "review_doc" | "whats_missing"`.
- Produces: `buildAgentContextBlock(context, intent): Promise<string>` appended to the system prompt; when `applicationId` present it preloads `getStatus`, when `opportunityId` present it preloads the opportunity row, when `uploadId`/`documentId` present it notes the doc is available via `read_document`.

- [ ] **Step 1: Write the failing test**

```ts
import { INTENT_PRESETS } from "./chat.service";

describe("INTENT_PRESETS", () => {
  it("maps every intent to a non-empty instruction", () => {
    for (const key of ["fit_check","next_move","review_doc","whats_missing"]) {
      expect(INTENT_PRESETS[key]).toMatch(/\S/);
    }
  });
  it("free_chat adds no extra instruction", () => {
    expect(INTENT_PRESETS.free_chat).toBe("");
  });
});
```

- [ ] **Step 2: Run it, verify fail.** Run: `cd backend/services/services/api && npx jest chat.context --maxWorkers=2` → FAIL.

- [ ] **Step 3: Implement.** Add and export `INTENT_PRESETS`:

```ts
export const INTENT_PRESETS: Record<string, string> = {
  free_chat: "",
  fit_check: "The user opened this from an opportunity and wants an honest fit assessment. Call analyze_fit, then give strengths, the top gap, and one concrete next action.",
  next_move: "The user wants their single most important next move for this opportunity/application right now. Be specific and actionable.",
  review_doc: "The user wants feedback on a specific document. Read it with read_document, then give focused, prioritized improvements.",
  whats_missing: "The user wants to know what's left before they can submit this application. Use get_application_status and list the missing required documents and steps.",
};
```

Thread `context`/`intent` from the controller through `sendMessage` into `runAgentTurn`. In `buildAgentSystemPrompt`, append `INTENT_PRESETS[intent]` (when non-empty) and the result of `buildAgentContextBlock`. `buildAgentContextBlock` preloads the focused entity (application status / opportunity / note that an upload is attached) so the model starts grounded. Gate all of this behind `process.env.AI_WINCOACH_ENABLED !== "false"`; when off, `context`/`intent` are ignored and behavior is exactly as today.

- [ ] **Step 4: Run tests, verify pass.** Same jest command → PASS.

- [ ] **Step 5: Full backend test + lint**

Run: `cd backend/services/services/api && npx jest --maxWorkers=2 && npm run lint`
Expected: PASS, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add backend/services/services/api/src/chat
git commit -m "feat(chat): context-aware agent — screen context + intent presets"
```

---

## Phase 5 — Mobile: upload, inline actions, floating assistant

### Task 8: Mobile chat service carries context + intent

**Files:**
- Modify: `edutumobile/packages/core/src/services/chat.ts` (`sendChatMessage` / `postChatMessageToBackend`)
- Test: `edutumobile/__tests__/appControl.test.ts` sibling — add `edutumobile/__tests__/chatContext.test.ts`

**Interfaces:**
- Consumes: `sendChatMessage(input: { threadId?; message; userId; channel?; context?; intent? })`.
- Produces: the POST body to `/chat/messages` includes `context` and `intent` when provided.

- [ ] **Step 1: Write the failing test** asserting the fetch body includes `context`/`intent` when passed. Mock fetch, call `sendChatMessage` with a `context`, assert `JSON.parse(body).context.opportunityId` is set.

- [ ] **Step 2: Run it, verify fail.** Run: `cd edutumobile && npx jest chatContext --maxWorkers=2` → FAIL.

- [ ] **Step 3: Implement** — add `context?`/`intent?` to the type and pass them through the request body (do NOT send them to the chat-proxy fallback, which ignores them).

- [ ] **Step 4: Run tests, verify pass.** → PASS.

- [ ] **Step 5: Commit**

```bash
git add edutumobile/packages/core/src/services/chat.ts edutumobile/__tests__/chatContext.test.ts
git commit -m "feat(mobile): chat service carries screen context + intent"
```

### Task 9: `<AiActionBar>` inline-action component

**Files:**
- Create: `edutumobile/components/ai/AiActionBar.tsx`
- Modify: opportunity detail screen (`edutumobile/app/(app)/opportunity/[id].tsx` or the equivalent detail route), application tracker screen, document screen — add `<AiActionBar>` with the relevant `context`/`intent` presets.
- Test: `edutumobile/__tests__/aiActionBar.test.tsx`

**Interfaces:**
- Consumes: `sendChatMessage` (Task 8) via the existing `useChat` hook or a thin `useAiAction` wrapper.
- Produces: `<AiActionBar actions={[{ label, intent, context }]} onResult={...} />` rendering pill buttons; tapping one fires the agent and shows the reply in a result sheet reusing the chat message renderer.

- [ ] **Step 1: Write the failing test** — renders the given action labels; tapping calls the injected `onPress` with the right `intent`.

- [ ] **Step 2: Run it, verify fail.** Run: `cd edutumobile && npx jest aiActionBar --maxWorkers=2` → FAIL.

- [ ] **Step 3: Implement** the component (follow existing component/styling conventions — nav-circle theme tokens). Keep it presentational; the screen supplies `context`.

- [ ] **Step 4: Wire it into the three screens** with presets: opportunity detail → `fit_check` + `next_move`; application tracker → `whats_missing` + `next_move`; document → `review_doc`.

- [ ] **Step 5: Run tests, verify pass.** → PASS.

- [ ] **Step 6: Lint + commit**

```bash
cd edutumobile && npm run lint
git add edutumobile/components/ai edutumobile/app edutumobile/__tests__/aiActionBar.test.tsx
git commit -m "feat(mobile): AiActionBar inline win-coach actions on key screens"
```

### Task 10: Floating assistant + upload UI

**Files:**
- Create: `edutumobile/components/ai/FloatingAssistant.tsx` (global entry point; reuses the nav-circle/FAB pattern; opens chat with current-screen context)
- Create: `edutumobile/components/ai/DocumentUpload.tsx` (expo-document-picker → `POST /uploads` → PUT file → `POST /uploads/:id/ingest`, shows parse status)
- Modify: the app shell/layout to mount `FloatingAssistant`; the documents screen + application screen to mount `DocumentUpload`.
- Test: `edutumobile/__tests__/documentUpload.test.tsx` (mock the three network calls; assert the sequence and that parse-status renders).

**Interfaces:**
- Consumes: a small `uploadsApi` in `edutumobile/packages/core/src/services/uploads.ts` wrapping the three calls.
- Produces: user can upload a real document and it becomes readable by the agent (`upload_id` passed via `context` to `fit_check`/`review_doc`).

- [ ] **Step 1: Write the failing test** for `uploadsApi.upload(file)` — asserts POST /uploads, then PUT to the signed url, then POST /uploads/:id/ingest, returning `{ uploadId, parseStatus }`.

- [ ] **Step 2: Run it, verify fail.** Run: `cd edutumobile && npx jest documentUpload --maxWorkers=2` → FAIL.

- [ ] **Step 3: Implement** `uploadsApi`, `DocumentUpload`, `FloatingAssistant`.

- [ ] **Step 4: Run tests, verify pass.** → PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd edutumobile && npm run lint
git add edutumobile/components/ai edutumobile/packages/core/src/services/uploads.ts edutumobile/__tests__/documentUpload.test.tsx edutumobile/app
git commit -m "feat(mobile): floating assistant + document upload/parse UI"
```

---

## Phase 6 — Proactive nudges

### Task 11: Application-completeness nudges in the alert engine

**Files:**
- Modify: `backend/services/services/api/src/alerts/opportunity-alerts.service.ts` (add a scan)
- Test: `backend/services/services/api/src/alerts/win-coach-nudges.spec.ts`

**Interfaces:**
- Consumes: `ApplicationDocumentsService.listForUser`, the existing push pipeline + quiet-hours guard in the alerts service, and the existing `coach.pulse` copy generation.
- Produces: `scanApplicationCompleteness(): Promise<number>` — for each application with an approaching deadline (≤7 days) and non-empty `missingRoles`, enqueue one nudge; deduped via the existing alert ledger (memory `opportunity-alert-ledger`), never re-nudged for the same (application, missing-set) state.

- [ ] **Step 1: Write the failing test** — given one application 5 days out with `missingRoles=["sop"]` and one complete application, exactly one nudge is enqueued; running the scan twice enqueues zero the second time (ledger dedup).

- [ ] **Step 2: Run it, verify fail.** Run: `cd backend/services/services/api && npx jest win-coach-nudges --maxWorkers=2` → FAIL.

- [ ] **Step 3: Implement** `scanApplicationCompleteness`, reusing the ledger key pattern and quiet-hours guard already in the alerts service; nudge copy via the existing `coach.pulse` generation with the missing roles + days-left as input. Register it on the same schedule/cron the alerts service already uses.

- [ ] **Step 4: Run tests, verify pass.** → PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd backend/services/services/api && npm run lint
git add backend/services/services/api/src/alerts
git commit -m "feat(alerts): proactive win-coach nudges for incomplete applications near deadline"
```

---

## Final verification

- [ ] Backend: `cd backend/services/services/api && npx jest --maxWorkers=2 && npm run lint && npx tsc --noEmit` — all green.
- [ ] Mobile: `cd edutumobile && npx jest --maxWorkers=2 && npm run lint` — all green.
- [ ] Manual (via `/verify`): with `AI_WINCOACH_ENABLED` on — upload a real CV, open an opportunity, tap "Am I a fit?", confirm the reply cites the uploaded CV; mark a doc submitted, confirm the application flips to submitted when required roles are complete; confirm a near-deadline incomplete application produces exactly one nudge.
- [ ] Confirm with `AI_WINCOACH_ENABLED=false` the agent behaves exactly as before (no context/intent effects, tools still present but unused).

## Notes / assumptions to verify during implementation

- Exact `DocumentsService` method signatures (`get`, `list`) — confirmed used in `coach-tools.service.ts`; re-check return shapes when wiring `read_document`.
- Exact opportunity detail / application tracker route file names in `edutumobile/app` — locate before Task 9 (the plan references likely paths).
- The alerts service's schedule/cron registration point and ledger helper — read before Task 11.
- `db/schema.ts` import list already includes `integer` — add it if not.
