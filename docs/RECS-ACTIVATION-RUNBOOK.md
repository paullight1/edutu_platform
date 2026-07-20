# Recommendation Engine Activation Runbook

**Audience:** the project owner, operating on `edutu-platform.onrender.com` (Render service `edutu-api`) against the production Supabase project.

**What this fixes:** the hybrid recommendation engine (pgvector embeddings + behavioral signals + rules) is fully implemented but running in degraded `heuristic_v1` (keyword-overlap) mode everywhere, because `GEMINI_API_KEY` is unset in production and zero opportunity rows have embeddings. Setting the key and running the backfill activates the blended engine.

**Verified against live data at the time this runbook was written:** the connected Supabase project (`sioxocmrjmdevsdlzjns`, the same one in `backend/services/services/api/.env` and referenced by production `.env.example` files across the repo) has **286 active opportunities, 0 with an embedding**. No `ai_routes` override row exists for any `embeddings.*` feature, and no Gemini key is stored in the `ai_provider_keys` table — so `GEMINI_API_KEY` really is the only missing piece; there is no DB-side override that would keep the engine degraded after you set it.

---

## If something looks wrong, do this first

1. Hit `GET https://edutu-platform.onrender.com/health` (no auth required). Check `ai.gemini`:
   - `"missing"` → the env var isn't set yet, or the deploy carrying it hasn't finished. Nothing downstream can work.
   - `"configured"` → the key is present in the running process. If recs are still degraded, the problem is embedding coverage (Verification section) or a bad key (check Render logs for `Embedding request failed for embeddings.*`).
2. Tail the Render logs for the line `recs engine=... user=... candidates=... returned=... ms=...` (emitted by `OpportunityRankingService.queryRecommendations`, `backend/services/services/api/src/opportunities/opportunity-ranking.service.ts` ~line 449). `engine=heuristic_v1` on every line means the switch did not take for that request path — most commonly because `RECS_ENGINE` got set to something other than `hybrid`, or the requesting user's profile embedding failed.
3. If alert volume looks wrong (way up or way down) within the first 3 days, see the **Post-activation watch list** section before touching anything else — that's an expected calibration risk, not necessarily a bug.

---

## 1. What activates and what changes

Everything is gated by a single runtime check in `OpportunityRankingService.queryRecommendations` (`opportunity-ranking.service.ts` line 372):

```ts
if (RECS_ENGINE === "hybrid") {
  profileEmbedding = ... this.embeddingService.getProfileEmbedding(...) ...
}
```

`RECS_ENGINE` already defaults to `"hybrid"` in code (line 50: `const RECS_ENGINE = (process.env.RECS_ENGINE || "hybrid").toLowerCase();`) and is **not currently set at all in `render.yaml`**, so no env var change is required to flip this flag — it is already "on" in the sense that the code path is live. What is missing is the ability for that path to actually produce an embedding.

The per-request outcome is decided at `opportunity-ranking.service.ts` line 398:
```ts
const engine = profileEmbedding ? "hybrid_v2" : "heuristic_v1";
```
`profileEmbedding` is non-null only when `OpportunityEmbeddingService.getProfileEmbedding()` (or, for anonymous queries, `resolveQueryEmbedding()`) successfully calls Gemini and gets a vector back. Today that call always returns `null` (no key), so `engine` is always `heuristic_v1`.

`scoreOpportunitiesForUser` (line ~478, used for match badges) has the identical `RECS_ENGINE === "hybrid"` gate and the identical `engine` derivation.

**Surfaces that flip from `heuristic_v1` to `hybrid_v2` once embeddings exist:**
- In-chat opportunity recommendations — `chat.service.ts` / `chat/tools/coach-tools.service.ts` call `getRecommendationsForUser` / `queryRecommendations`.
- The feed endpoint `POST /opportunities/recommendations` and the anonymous `POST /opportunities/recommendations/query`.
- Match badges — `POST /opportunities/match-scores`, backed by `scoreOpportunitiesForUser`.
- The proactive alert engine (`alerts/opportunity-alerts.service.ts` line 259, which calls `rankingService.scoreOpportunitiesForUser` then filters by `MIN_SCORE`).
- The paid `/v1` API product (`edutu-api.service.ts` also calls into the ranking service — not independently re-verified line-by-line in this runbook; UNVERIFIED: exact call site inside `edutu-api.service.ts`, only confirmed it references the same recommendation functions via grep).

Nothing else changes: the heuristic rule scoring (`computeProfileFit`) still runs in hybrid mode too — it becomes one of four blended components (`profileFit`, weight `0.25` by default) alongside `semantic` (`0.45`), `behavior` (`0.2`), and `freshness` (`0.1`), per `recommendation-blender.ts` `DEFAULT_WEIGHTS`. These weights are independently tunable via `RECS_WEIGHT_SEMANTIC` / `RECS_WEIGHT_BEHAVIOR` / `RECS_WEIGHT_PROFILE_FIT` / `RECS_WEIGHT_FRESHNESS` env vars (UNVERIFIED exact var names beyond what `loadWeightsFromEnv` implies — confirm in `recommendation-blender.ts` before changing them; not required for activation).

## 2. Prerequisites

| What | Exact name | Where it lives | Current state (verified) |
|---|---|---|---|
| Engine flag | `RECS_ENGINE` | env, read in `opportunity-ranking.service.ts` line 50 | Not set in `render.yaml` → defaults to `"hybrid"` already. No action needed unless someone previously set it to something else in the Render dashboard directly (render.yaml doesn't capture dashboard-only overrides — check the dashboard). |
| Embedding provider key | `GEMINI_API_KEY` | env, read in `ai.service.ts` line 861 (`getEnvKey`) | Declared in `render.yaml` (line 32) as `sync: false` (i.e. must be set manually in the Render dashboard, not via the yaml). Not present in the local `.env` either. Confirmed empty in the DB fallback path too (no row in `ai_provider_keys` for provider `gemini`, no `ai_routes` override for `embeddings.*` — see below). This is the one value to add. |
| DB: pgvector extension | `vector` extension | `create extension if not exists vector;` in `supabase/migrations/20260707000000_recommendation_engine_pgvector.sql` | Present (migration applied — the `embedding` column and HNSW index below already exist in the live schema, confirmed by direct query). |
| DB: embedding column | `public.opportunities.embedding` (`vector(768)`), plus `embedding_model text`, `embedded_at timestamptz` | Same migration | Column exists; 0 of 286 active rows populated (verified live). |
| DB: ANN index | `idx_opportunities_embedding_hnsw` — HNSW, cosine ops, partial `where status = 'active' and embedding is not null` | Same migration | Exists. Because it's partial, it costs nothing while embeddings are empty and starts being used as soon as any rows populate. |
| DB: profile embedding table | `public.user_profile_embeddings` (`user_id text primary key`, `embedding vector(768)`, `embedding_model`, `profile_hash`) | Same migration | Exists. |
| Admin allowlist | `ADMIN_EMAILS` | env, `admin.guard.ts` line 39 | Needed to call the admin backfill endpoint below with your account's email (or a role of `admin`/`super_admin`/`moderator`/`support_agent`). |

Model used: `text-embedding-004` (Gemini), 768 dimensions — hardcoded as the `embeddings.opportunity` / `embeddings.profile` / `embeddings.query` route defaults in `ai.service.ts` (`DEFAULT_ROUTES`, lines 234–248), and matches `EMBEDDING_DIMENSIONS = 768` in `opportunity-embedding.service.ts` line 10 and the `vector(768)` column type.

**Confirmed constraint held:** `embeddings.*` routes are pinned to Gemini and — unlike other AI features — do **not** get the automatic provider-reroute-on-missing-key fallback (`ai.service.ts` line 737: `if (!apiKey && !options.feature.startsWith("embeddings."))`). So there is no risk of embeddings silently routing to DeepSeek; they simply return `null` (degrade to heuristic) until `GEMINI_API_KEY` exists. This also means an admin cannot accidentally "fix" embeddings by pointing `ai_routes` at DeepSeek — DeepSeek has no `generateEmbedding` adapter method, so that would just also return `null`. At the time of writing, the `ai_routes` table has no row at all for any `embeddings.*` feature (verified by query), so the code defaults above are what's actually in effect.

## 3. Step-by-step activation

1. **Set the env var.** Render dashboard → `edutu-api` service → Environment → add/edit `GEMINI_API_KEY` with a valid Gemini API key. Do not touch `RECS_ENGINE` (leave unset; it already defaults to `hybrid`).
2. **Save.** Render redeploys/restarts the service automatically when an environment variable changes on an existing service — this is independent of the `autoDeploy: false` setting in `render.yaml`, which only governs auto-deploy-on-git-push. (UNVERIFIED: this is standard Render platform behavior, not something confirmable from this repo's code — watch the Render dashboard's deploy/events log to confirm a restart actually happened before proceeding.)
3. **Confirm the key loaded:** `curl https://edutu-platform.onrender.com/health` → `ai.gemini` should now read `"configured"`.
4. **Run the backfill.** This is an admin-guarded HTTP endpoint, not a script or a cron you wait for:
   ```
   POST https://edutu-platform.onrender.com/opportunities/admin/embeddings/backfill
   Authorization: Bearer <clerk session token for an ADMIN_EMAILS account, or an account with role admin/super_admin/moderator/support_agent>
   Content-Type: application/json

   { "limit": 2000 }
   ```
   (`opportunities.controller.ts` line 366, guarded by `AdminGuard`.) `limit` is optional (defaults to 200, clamped to a max of 2000 — `opportunity-embedding.service.ts` line 355). Pass `2000` to cover all 286 active rows in one call; there's no harm in a larger number than you need.
   - This calls `OpportunityEmbeddingService.backfillOpportunityEmbeddings()`, which selects active rows **missing** an embedding (`isNull(opportunities.embedding)` unless you pass `"reembed": true`), processes them in batches of `BACKFILL_BATCH_SIZE = 50`, and sleeps `BACKFILL_BATCH_PAUSE_MS = 500`ms between batches (code comment: "Gemini free-tier RPM safety").
   - **Resumable, confirmed:** because the query filter is always "embedding IS NULL", the backfill is naturally idempotent/resumable — a second call (or a restart mid-run) just picks up whatever rows still lack an embedding. There's no separate cursor/checkpoint state to manage.
   - A response body of the shape `{ processed, embedded, skipped, failed }` comes back synchronously — the request blocks until the batch finishes.
5. **No step 5.** There is no separate "flip the switch" step — once `GEMINI_API_KEY` is present and rows have embeddings, the very next request through `queryRecommendations` picks up `hybrid_v2` automatically.

There is also an **hourly cron safety net** (`opportunity-embedding.service.ts` line 446, `@Cron(CronExpression.EVERY_HOUR)` → `backfillOpportunityEmbeddings({ limit: 100 })`) that will pick up any newly-scraped or missed rows going forward — you do not need to re-run the manual backfill routinely, just once now to clear the existing 286-row backlog.

## 4. Expected duration and cost

- Row count (verified live): 286 active opportunities, all currently missing embeddings.
- At batch size 50 with a 500ms pause between batches: 6 batches (50×5 + 36), 5 pauses ≈ 2.5s of enforced sleep, plus however long each Gemini embedding call takes (typically low seconds per batch). Expect the whole backfill to finish in well under a minute for the current backlog.
- UNVERIFIED: exact Gemini API cost/quota for `text-embedding-004`. The code comment says batching/pacing is sized to stay "well under" Gemini's free-tier rate limits, but no pricing constants exist in this repo to confirm dollar cost — at 286 short text blobs this is very unlikely to be meaningfully billed regardless of tier, but confirm your Gemini project's actual quota/plan if you want a number.
- Ongoing cost per new opportunity: one embedding call at scrape/ingestion time (`embedOpportunity`) plus the hourly catch-up cron for stragglers — both bounded by the same route/key.
- Model: `text-embedding-004` via the `embeddings.opportunity` / `embeddings.profile` / `embeddings.query` routes, and (per the standing project constraint, verified above) these stay pinned to Gemini regardless of what other AI features are routed to DeepSeek/OpenRouter/etc.

## 5. Verification

**A. Embedding coverage (SQL — run in Supabase or via `psql`):**
```sql
select
  count(*) filter (where status = 'active') as active_total,
  count(*) filter (where status = 'active' and embedding is not null) as active_embedded,
  count(*) filter (where status = 'active' and embedding is null) as active_missing
from public.opportunities;
```
Before activation this returns `active_total = 286, active_embedded = 0, active_missing = 286` (verified). After the backfill, `active_missing` should be 0 (or close to it — `skipped` count in the backfill response covers rows whose corpus text was empty, which will never embed no matter how many times you re-run it).

**B. Which engine served a request — the field name is `engine`, confirmed in two places:**
- Every recommendation/match-score response body includes a top-level `engine` field (and each opportunity item also carries it) with value `"hybrid_v2"` or `"heuristic_v1"` — set at `opportunity-ranking.service.ts` line 398 and again at line 492 for `scoreOpportunitiesForUser`.
- The Render log line `recs engine=<engine> user=<id|anon> candidates=<n> returned=<n> ms=<n>` is emitted on every call to `queryRecommendations` (line 449–451).

**C. Concrete smoke check (no auth needed — uses the public anonymous endpoint):**
```bash
curl -s -X POST https://edutu-platform.onrender.com/opportunities/recommendations/query \
  -H "Content-Type: application/json" \
  -d '{
    "profile": {
      "country": "Nigeria",
      "skills": ["software engineering", "data analysis"],
      "interests": ["scholarships", "technology"]
    },
    "limit": 5
  }' | jq '.engine, .opportunities[0].engine, .opportunities[0].match_components'
```
- Before activation: `engine` is `"heuristic_v1"`, `match_components` is `null`.
- After activation (key set + backfill run): `engine` should be `"hybrid_v2"`, and `match_components` should be a populated object with `semantic`, `behavior`, `profile_fit`, `freshness` keys.
- Note: this public endpoint has a hard 400ms timeout on the embedding call (`PUBLIC_QUERY_EMBED_TIMEOUT_MS`, line 57) specifically so it never blocks — if Gemini is slow on a cold cache hit, a single call might still report `heuristic_v1` even with everything configured correctly. Retry once; the query embedding gets cached for 30 minutes after the first successful call for that exact profile hash.
- For an authenticated check instead, `POST /opportunities/recommendations` or `/opportunities/match-scores` with `Authorization: Bearer <token>` will show the same fields for a real user profile — but note the authenticated feed responses are cached in-process for 45s (`RECS_CACHE_TTL_MS`, default) per user+params, so if you test immediately after switching, request with a `message` field (conversational queries are never cached — line 306) or wait out the TTL to avoid reading a stale pre-activation response.

## 6. Rollback

Set `RECS_ENGINE=heuristic` in the Render dashboard and save. The comparison at line 50 is `RECS_ENGINE === "hybrid"` (case-insensitive, lowercased) — so any value other than exactly `hybrid` disables the blended path, but `heuristic` is the documented, intentional value (code comment line 48: `// Rollout flag: "hybrid" ... or "heuristic" (legacy behavior only)`).

What this does, confirmed from code:
- `queryRecommendations` skips the `getProfileEmbedding`/`resolveQueryEmbedding` call entirely — `profileEmbedding` stays `null` — so `engine` reverts to `heuristic_v1` for every request, immediately, with no partial/mixed state.
- `scoreOpportunitiesForUser` has the identical gate, so match badges and the alert engine also revert instantly.
- `rankCandidate`'s `useBlender` flag becomes `false`, which switches to the legacy additive scoring path (`fit.rawScore + signal.score`, clamped 0–100) — described in the code as "a true kill switch back to pre-refactor behavior" (line 985).
- Existing embeddings in the `opportunities` table and `user_profile_embeddings` are **not deleted** by this rollback — they just stop being read. Re-enabling later (`RECS_ENGINE=hybrid`) picks them back up with no re-backfill needed, aside from any opportunities scraped while it was off (the hourly cron only runs while the process is up, regardless of `RECS_ENGINE` — UNVERIFIED whether `handleEmbeddingCatchUp` itself checks `RECS_ENGINE`; reading the code, it does not — it runs unconditionally, so embeddings keep accumulating even while the engine is rolled back to heuristic).
- The Render env var change triggers a restart, which clears the in-process response caches (`responseCache`, `queryEmbeddingCache`, `profileEmbeddingCache`) — so there's no stale-cache concern on rollback either.

## 7. Post-activation watch list

`ALERTS_MIN_SCORE` (env var, default `62` — `alerts/opportunity-alerts.service.ts` line 64: `const MIN_SCORE = Number(process.env.ALERTS_MIN_SCORE || 62);`) was calibrated against `heuristic_v1` scores (additive rule score, base 20, roughly 0–100 but clustering in a narrow band). `hybrid_v2` scores are a weighted blend of four 0–1 components scaled to 0–100 (`blendScore` in `recommendation-blender.ts`) and will have a **different distribution** — likely smoother/more spread out, since semantic similarity behaves very differently from keyword overlap. The same threshold of 62 may pass far more or far fewer candidates than before.

Where `MIN_SCORE` is used (both gate alert selection directly):
- Interest-alert candidate filtering: `alerts/opportunity-alerts.service.ts` line 265, `.filter((s) => s.match_score >= MIN_SCORE)`.
- Feed-based alert minimum: line 293, `getRecommendationsForUser(userId, { limit: 25, minMatchScore: MIN_SCORE })`.

**What to watch for ~3 days after switching:**
- Daily count of `MIN_SCORE`-gated interest alerts actually sent, verified against the schema (`db/schema.ts` line 439: table `opportunity_alert_ledger`, columns `user_id`, `opportunity_id`, `kind`, `sent_at`; `kind = 'interest'` is the value written at `opportunity-alerts.service.ts` line 227 specifically for the score-gated path — deadline-reminder rows use other `kind` values like `deadline-reminder`/`deadline_Xd` and are unaffected by `ALERTS_MIN_SCORE`):
  ```sql
  select date_trunc('day', sent_at) as day, count(*) as interest_alerts_sent
  from public.opportunity_alert_ledger
  where kind = 'interest'
  group by 1
  order by 1 desc
  limit 10;
  ```
- Compare that daily count against the pre-switch baseline (same query over the prior week, before you set `GEMINI_API_KEY`).
- **The knob to turn if volume spikes or collapses:** adjust `ALERTS_MIN_SCORE` in the Render dashboard (no redeploy of code needed, just the env var) — raise it if alert volume spiked (too many low-quality hybrid matches now clearing the old bar), lower it if volume collapsed (hybrid scores cluster lower than heuristic scores did for your current user base). There is no code-level guardrail or rate limit beyond this threshold, so this is a manual tuning loop — check daily, adjust, wait a day, repeat until volume looks sane relative to history.

---

## Summary of anything UNVERIFIED in this runbook

- Whether Render actually auto-restarts on an env-var-only change (platform behavior, not in this repo — confirm via the Render deploy log).
- The exact call site and behavior inside `edutu-api.service.ts` (the paid `/v1` product) — confirmed only via grep that it references the same recommendation functions, not read line-by-line.
- Exact `RECS_WEIGHT_*` env var names for tuning blend weights beyond the defaults — not required for activation, mentioned only as an FYI.
- Real-world Gemini `text-embedding-004` dollar cost/quota — no pricing constants exist in this codebase to verify against.
