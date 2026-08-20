# Secret Rotation Runbook

Rotates the credentials flagged HIGH by the Claude Security scan (F2/F3/F8/F9).
These are **operational** steps performed in provider dashboards — there is no
code change to make. The code already reads every one of these from the
environment; nothing sensitive is committed (only `.env.example` templates are
tracked in git).

## What to rotate (rotate all four together)

| # | Secret | Where it's used | Blast radius of rotation |
|---|--------|-----------------|--------------------------|
| F2 | **Supabase `service_role` JWT** | Backend (Render), edge functions | Backend loses DB access until the new key is set in Render |
| F3 | **Postgres password** | Direct `DATABASE_URL` connections | Any direct-connection consumer must update its URL |
| F8 | **DeepSeek API key** | AI features (chat, CV, deadline extraction) | AI calls fail until the new key is set |
| F9 | **`API_KEY_PEPPER`** | HMAC of issued `/v1` API keys | See the ⚠️ note below |

⚠️ **`API_KEY_PEPPER`** — rotating it invalidates every already-issued `/v1`
API key (they were HMAC'd with the old pepper). At time of writing `api_consumers`
is empty (no keys issued), so **now is the zero-cost moment to rotate it**. Once
partners hold keys, a pepper rotation requires re-issuing every key.

## Where these currently live (all gitignored, untracked)

- `render.backend.env` (the source of truth for Render)
- `backend/services/services/api/.env` (local dev duplicate)
- `pay-edutu-org/.env.local` (duplicate)

After rotating, update **all** copies, and prefer a secret manager over flat
`.env` files going forward.

## Steps

1. **Supabase service_role JWT + Postgres password**
   - Supabase Dashboard → Project → Settings → API → *Reset* the `service_role`
     key (or Database → *Reset database password* for the Postgres password).
   - Copy the new value into Render (`SUPABASE_SERVICE_ROLE_KEY` /
     `DATABASE_URL`) and every `.env` copy above.
   - If the n8n-webhook edge function is used, update its
     `SUPABASE_SERVICE_ROLE_KEY` in the Supabase Edge Function secrets too.

2. **DeepSeek key** — DeepSeek console → rotate → set `DEEPSEEK_API_KEY` in Render.

3. **`API_KEY_PEPPER`** — generate a new ≥32-char random value
   (`openssl rand -hex 32`), set `API_KEY_PEPPER` in Render. The API refuses to
   boot in production without it (see `main.ts`).

4. **Redeploy** the backend on Render so it picks up the new environment. Watch
   the boot logs for a clean start (`node dist/main`), then smoke-test:
   - `GET /health` returns 200,
   - one authenticated learner request succeeds (DB access proven),
   - an AI feature (e.g. coach reply) succeeds (DeepSeek proven).

5. **Invalidate the old values** — once the new deploy is verified, the reset in
   step 1 already invalidated the old Supabase secrets; confirm no service still
   references the old DeepSeek key.

## Verification checklist

- [ ] New `service_role` key set in Render + edge function secrets
- [ ] New Postgres password set in every `DATABASE_URL`
- [ ] New DeepSeek key set; an AI call succeeds
- [ ] New `API_KEY_PEPPER` set; backend booted; `/v1/health` 200
- [ ] Old values removed from every `.env` copy and any secret manager
- [ ] Confirm `git ls-files | grep -E '\.env$'` returns nothing (no real env committed)
