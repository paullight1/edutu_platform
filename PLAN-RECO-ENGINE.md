# PLAN: World-Class Opportunity Recommendation Engine

_Compiled 2026-07-12 from 2 research sweeps (recsys architecture + opportunity-matching products) and 2 codebase/data audits (backend engine + client surfaces). This is the reference doc for the build-out._

---

## Part 1 — What "world class" means for an opportunity recommendation engine

### The framing

Opportunity matching is a **reciprocal, high-stakes, deadline-bound** recommendation problem. Unlike Netflix, a bad recommendation costs the user hours of application effort, and the item can reject the user back. Items expire; all inventory starts cold and dies on a deadline.

At Edutu's scale (~10² – 10³ live items, 10³ – 10⁵ users) we can **exhaustively score every live item per user in Postgres in milliseconds**. So world-class here is NOT FAANG infra (two-tower training, Kafka, vector DBs — all explicitly premature at this scale). World-class is:

> **Signal completeness · eligibility gates that are never violated · deadline/runway awareness · verifiable explanations · negative feedback that visibly works · exploration for cold items · an evaluation harness · disciplined notifications.**

The canonical small-team stack — Postgres-as-feature-store, pgvector exact/HNSW search, cron batch scoring + thin online re-blend, embeddings computed at ingest — **is** the world-class implementation at this scale, not a compromise.

### The 10 pillars (calibrated to Edutu)

| # | Pillar | World-class bar | Edutu today |
|---|--------|-----------------|-------------|
| 1 | **Complete signal ledger** | Every impression (with position + surface), click, dwell, save, share, apply, dismissal-with-reason, outcome — logged reliably. This gates everything else (bandits, fatigue, eval, debiasing). | **~3/10.** Good type vocabulary incl. outcomes, but no impressions, no dwell, no search/category signals; outcome status changes never fire signals; delivery is fire-and-forget and silently lost on failure. Live volume: 10 rows. |
| 2 | **Hard eligibility gates** | Never show what the user cannot apply for. Eligibility = boolean SQL gate before ranking; unknown eligibility → ask the user, don't guess (Bold.org model). | **1/10.** Only `status='active' AND close_date >= today`. Country/education/age are soft score points; no structured eligibility fields extracted. |
| 3 | **Deadline/urgency trust** | Verified deadlines surfaced ("verified 2 days ago"), runway-aware ranking (enough time to actually complete the application), closing-soon-engaged items routed to reminders. Ghost-jobs crisis = the market gap; this is Edutu's moat. | **4/10 code, ~1/10 live.** Deadline-confidence taxonomy + verify-before-close system built, but `OPPORTUNITY_VERIFICATION_ENABLED=false` in prod env file; 94% of active items have unknown/no deadline confidence; only 108/389 active items have a future deadline. |
| 4 | **Hybrid retrieval + scoring** | Multi-source candidate mix (vector + trending + fresh + rules), blended scorer, weight redistribution for missing components. | **7/10 code, 2/10 live.** Blender (semantic .45/behavior .20/profileFit .25/freshness .10), HNSW partial index, profile-text user embedding w/ AI-memory concat, unembedded-fresh-item union — genuinely well-shaped. But **0/588 items embedded; no Gemini key in env OR `ai_provider_keys` (0 rows)** → whole prod runs `heuristic_v1`. |
| 5 | **Negative feedback & instant controls** | "Not interested" with typed reason (not eligible / wrong field / already applied) routed to different subsystems; feed visibly changes next refresh; impression fatigue. | **3/10.** Server side strong (dismiss = −100 + category exclusion + cache invalidation + permanent ID exclusion). But mobile home-card dismiss affordance unwired, web has none, no typed reasons, client never reads back local dismissals, no impression fatigue. |
| 6 | **Exploration & item cold-start** | Reserved fresh/exploration feed slots; Thompson sampling on per-item Beta posteriors over impression data. With expiring inventory, unexposed items die unexposed — this is inventory utilization. | **2/10.** Unembedded-recent union is a good cold-start seed; no reserved slots, no bandit, and impossible anyway without impressions. |
| 7 | **Verifiable explanations & calibrated confidence** | 1–3 reasons quoting the user's own profile + one honest gap; coarse bands (Strong/Good/Stretch), never spurious "92%" (miscalibration destroys trust). | **5/10.** match_reasons/risks primitives exist server+client. But two parallel scoring systems (server hybrid vs client evaluateMatch) disagree; web shows `max(client, server)`; precise %s everywhere. |
| 8 | **Two-sided scoring & portfolio** | P(wants it) × P(could win it); Safe/Match/Stretch labeled slots; stretch linked to gap-closing action (→ Edutu roadmaps — unique differentiator). | **0/10.** Nothing models winnability; Best Shots = top-3-by-match ≥60, client-side construct. |
| 9 | **Notification discipline** | Relevance floor, dedup/merge across alert types, global frequency caps, urgency-tiered channels (LinkedIn ATC: −50% volume → −65% complaints). | **7/10.** Best subsystem: ledger PK dedup, quiet hours w/ timezone, per-kind caps, min-score 62, interacted-item exclusion. Missing: cross-type global cap, interest+deadline merge for same item. |
| 10 | **Evaluation & learning loop** | Time-split offline replay (recall@k/NDCG), interleaving (needs ~10× less traffic than A/B — critical at our DAU), guardrails (coverage, dismissal rate, ineligible-application rate), outcome-weighted learning. | **0/10.** No offline eval, no experiment bucketing (flags are global env), no metrics tables, one log line per request. |

### Explicitly NOT world-class at this scale (do not build)

Trained two-tower models · dedicated vector DBs · Kafka/Flink streaming feature platforms · online model training · full IPS counterfactual eval · generative recs. Each is dominated by a simpler equivalent below ~10⁵ DAU.

---

## Part 2 — Current-state facts (from audits, 2026-07-12)

### Live production data
- 588 opportunities (389 active), **0 with embeddings**; `ai_provider_keys` empty; no `GEMINI_API_KEY` in `render.backend.env` → `embed()` returns null → **everyone gets `heuristic_v1`** despite `RECS_ENGINE=hybrid`.
- `user_profile_embeddings` 0 · `user_personalization` 0 · `user_opportunity_preferences` 0 · `user_opportunity_recommendations` 0 · `opportunity_alert_ledger` 0.
- Signals: 10 rows (9 view, 1 click). Profiles: 5 users; 1 country, 1 interests, 0 skills/major.
- Deadlines: 279/389 active have none; confidence unknown/null for ~94%; explicit for 2.
- `render.backend.env`: `OPPORTUNITY_VERIFICATION_ENABLED=false`, `SCRAPER_SCHEDULER_ENABLED=false` (NB: memory says scheduler ran hourly in prod — live Render env may differ from the repo file; verify).

### Backend (NestJS, `backend/services/services/api/src/opportunities/`)
- `recommendation-blender.ts` — blend formula + weights (env-overridable `RECS_WEIGHT_*`, loaded once at boot).
- `opportunity-ranking.service.ts` — candidates (ANN 300 + unembedded-recent 100 union), signal weights (view 2, click 5, share 10, save 12, apply 18, dismiss −100, outcome_offer 25…, clamp ±30/item), category affinity, 45s response cache, optional DeepSeek rerank (authed, opt-in).
- `opportunity-embedding.service.ts` — Gemini text-embedding-004, 768d, ingest-time fire-and-forget + resumable backfill (`POST /opportunities/admin/embeddings/backfill`) + hourly catch-up cron; profile embedding = profile text + AI-coach memories, SHA-256 invalidation.
- Serving: `POST /opportunities/recommendations` (authed), `/recommendations/query` (public), `/match-scores` (batch ≤50), `/signals`, `GET /search` (RRF hybrid FTS+trigram+semantic). All request-time; no precomputed scores; in-process TTL cache only (no Redis in recs).
- Alerts: interest cron 09:15 UTC (fresh ≤26h, min score 62, cap 2/day, backfill fallback) + deadline cron 07:45 (offsets 1/3/7); ledger dedup; quiet hours.
- Known issues: health endpoint reports embeddings from env only (misleading once DB key added); `pending_review` rows embedded but invisible to candidates; no signal time-decay; match components returned but never persisted.

### Clients
- Mobile feed: `packages/core` `fetchOpportunities` → server recs (limit 1000) → offline fallback = direct Supabase + local `evaluateMatch`. Sections: Featured, Best Shots (≥60, top 3), Recommended (top 8), category tiles. Android/iOS home-screen widgets (Top Matches personalized; **Trending widget is NOT personalized** — public recency list).
- Signals captured: detail-view 2, card-click 1, save +3/unsave −1, share 2, apply 5 (+ `POST /me/applications`), dismiss 1 (mobile detail only). Own raw `fetch`, silent drop on any failure, no retry/queue.
- **Gaps:** no impressions/dwell/search/category-tap signals; application status changes (rejected/offer!) fire NO signal; mobile home-card `onNotInterested` implemented but not passed (`index.tsx:1648`); web has no dismiss at all; `getDismissedOpportunityIds` never invoked → local feed never filters dismissed; web `personalizationService.ts` (whole Supabase reco path incl. `user_opportunity_recommendations`) is dead code; `opportunity_clicks` writes have undefined user_id (Clerk/UUID mismatch, marked TODO-retire); mobile `analytics.ts` is a console stub.
- Onboarding collects fields the engine ignores (gradeLevel, isGraduate, phone) and never writes skills/preferred_categories; web careerGoals/educationLevel/experienceLevel only reach the local fallback scorer.

---

## Part 3 — Build roadmap

### Phase 0 — Turn the engine on (config; ~1 day; **needs user for keys/Render**)
1. Provide `GEMINI_API_KEY` (Render env or `ai_provider_keys` control plane). Embeddings route must stay gemini.
2. Run embeddings backfill (588 items — minutes) + verify HNSW usage; warm profile embeddings.
3. Enable `OPPORTUNITY_VERIFICATION_ENABLED=true`; confirm live scraper scheduler state vs repo env file.
4. Fix health endpoint to reflect DB-key-backed embeddings (env-only check is misleading).
5. Deploy pending backend work (per existing deploy blockers: `ADMIN_EMAILS`, `API_KEY_PEPPER`).

**Exit criteria:** 100% active items embedded; recs log shows `engine=hybrid_v1`; deadline verification cron running.

### Phase 1 — Signal completeness (the ledger) (~3–5 days; pillar 1, unblocks 5, 6, 10)
1. **Impressions**: viewability tracking (`onViewableItemsChanged` mobile / IntersectionObserver web — web already has observers for pagination), batched beacon → new `impression` signal type with `{surface, position}` in details. Server: impression-fatigue discount (seen ≥5× unclicked → suppress).
2. **Dismiss everywhere, typed**: wire `onNotInterested` on mobile home card; add web affordance; one-tap reason (not eligible / wrong field / already applied / deadline too soon) → different routing (profile fact vs category exclusion vs dedup). Client reads back dismissed IDs (fix `getDismissedOpportunityIds` dead import).
3. **Outcome signals**: application status transitions fire `outcome_offer` / `outcome_rejected` / `outcome_withdrawn` (types already exist server-side!). Send rejection reflections to the engine, not just AsyncStorage.
4. **Search + category-tap signals**; dwell-on-detail (time-based upgrade of `view`).
5. **Reliable delivery**: offline queue + retry for signals (reuse ApiClient patterns); stop silent 401 loss.
6. **Kill dead channels**: retire `opportunity_clicks` write, web `personalizationService.ts`, decide analytics stub fate.
7. **Signal time-decay** server-side (half-life ~21d) — trivial once volume exists.

**Exit criteria:** every feed render produces impressions; dismissals possible from every card; outcomes flow; signal loss < 1%.

### Phase 2 — Trust layer: eligibility gates + deadline runway (~1 wk; pillars 2, 3, 7)
1. **Structured eligibility extraction** at scrape/enrichment time (LLM): eligible countries/regions, age range, education level, field constraints → new columns; backfill 588.
2. **Hard SQL gates** on nationality/education/age vs profile; unknown user field → "Confirm one thing" profile prompt, not a guess; unknown item field → flagged "check eligibility: X".
3. **Runway-aware ranking**: estimated application effort vs time remaining; suppress new recs under threshold; closing-soon-engaged items route to reminder channel (already exists) instead.
4. **Deadline trust surfacing**: "Deadline verified Xd ago" from verification runs; never show unknown-confidence deadlines without a flag.
5. **One scoring truth**: web `explainOpportunity` server-first always (kill `max(client,server)`); client `evaluateMatch` demoted to offline-only on web (as mobile already does).
6. **Coarse bands**: Strong / Good / Stretch replace raw percentages in all UI (keep % internal).

**Exit criteria:** zero ineligible items in any feed for a fully-profiled user; every deadline shown carries confidence; one score authority.

### Phase 3 — Re-rank layer: diversity, exploration, session-awareness (~1 wk; pillars 4, 5, 6)
1. **Explicit re-rank pass** in ranking service (post-blend, pre-serve): MMR diversity over embeddings (λ ≈ 0.7), per-category caps, interest-mix calibration.
2. **Reserved slots per feed page**: 1 fresh-this-week (guaranteed N impressions within 48h of ingest), 1 exploration via Thompson sampling on per-item Beta(CTR) posteriors from the impressions table, 1 serendipity (adjacent unengaged category).
3. **Session-aware online blend**: last-session signals re-rank the cached/batch scores at request time (cheap category/embedding nudges) — feed visibly responds within one session.
4. **Composed real-time user vector**: profile embedding + decayed average of engaged-item embeddings (positives pull, dismissals push) — "poor man's two-tower", no training infra.
5. Optional: cron precompute top-N per active user → table (alert engine reuses instead of re-scoring; Redis when REDIS_URL lands).

**Exit criteria:** no category >3 of top 10; every new item gets first impressions ≤48h; feed changes within a session after engagement.

### Phase 4 — Evaluation harness (~4–5 days; pillar 10)
1. **Metrics tables**: per-surface rec CTR, save rate, apply rate per impression, dismissal rate + reason mix, ineligible-application rate, catalog coverage %, alert CTR vs mute.
2. **Nightly time-split replay**: score yesterday's impressions with current engine; recall@10 / NDCG@10 vs actual engagements; trend persisted.
3. **Per-user experiment bucketing** on `RECS_ENGINE`/weights (hash-based) + interleaving mode (mix A/B rankings, count wins — works at tiny DAU).
4. **Guardrails + admin dashboard page** (engine health: embedding coverage, signal volume, eval trends, alert stats).

**Exit criteria:** any ranking change is measurable within a week without a deploy-and-pray.

### Phase 5 — Differentiators (~1–2 wks; pillars 8, 9 + moat)
1. **Winnability proxies**: selectivity tier, requirements-vs-profile gap, (later) applicant volume → "You'd be a strong applicant" band.
2. **Portfolio Best Shots**: labeled Safe / Match / Stretch weekly slots; **stretch card links to a roadmap that closes the stated gap** (unique to Edutu).
3. **Provenance-true explanations**: reasons quote the user's own profile + one honest gap ("Requires Master's — you're final-year BSc").
4. **Alert upgrades**: global per-user daily cap across kinds; merge interest+deadline for same item; verified-deadline copy.
5. **Preference freshness**: periodic "still true?" re-elicitation (semester cadence); editable interest profile that re-weights the user vector instantly.

**Exit criteria:** Best Shots is a strategy surface, not a sorted list; alerts feel curated; explanations survive user fact-checking.

---

## Sequencing logic

Phase 0 is a switch-flip that activates ~half the already-built value. Phase 1 before everything else because impressions/negatives gate exploration (P3), evaluation (P4), and fatigue — and signal volume compounds with time, so start collecting NOW. Phase 2 before growth because a single ineligible or expired recommendation costs more trust than ten good ones earn. P3–P5 then iterate behind the P4 harness.
