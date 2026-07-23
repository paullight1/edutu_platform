# Edutu — Store Launch Checklist

_Compiled 2026-07-23, the day the AI backend went live in production (verified: the
coach returns real context-aware answers). This is the gap between "prod backend
works" and "apps are in the App Store / Play Store"._

Legend: 🔴 blocks submission · 🟡 strongly recommended before real users · 🟢 post-launch fine

---

## 1 · Production mobile builds — 🔴 (nothing can ship without these)

- [ ] 🔴 **Clerk `pk_live` in EAS env** — EAS still carries the dev `pk_test` key.
      A store build with pk_test = every backend call 401s for real users
      (exact failure the web app hit; see memory "Web Clerk dev-key 401s").
      Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` per EAS profile → production.
- [ ] 🔴 **`google-services.json`** present/correct for the Android build
      (`com.edutu.com` package — must match or Firebase crashes app on launch).
- [ ] 🔴 **`eas build --profile production`** for iOS + Android **from `main`**
      (main now has: rpc auth fix, tier language, season pass, all QA fixes).
- [ ] 🔴 Native modules picked up: widgets suite, i18n resources, dev-FAB flag
      are all in app.config — a fresh native build covers them. Do NOT ship an
      OTA update onto an old binary as the "launch"; the July native changes
      (widgets, i18n, RevenueCat) need a real build.
- [ ] 🟡 Verify the production build boots on a device/simulator BEFORE
      submitting (splash → sign-in → home). Debug-only crutches (Mock Pro,
      dev menu) must be absent.

## 2 · Payments / IAP — 🔴 for any paid feature

- [ ] 🔴 **App Store Connect + Play Console IAP products** created for the
      subscription tiers (weekly/monthly/yearly) — RevenueCat currently runs on
      the **Test Store**; store review will reject or purchases will fail.
      Attach real product IDs in RevenueCat, then verify offerings resolve.
- [ ] 🔴 **Credit packs**: mobile Buy Credits sheet shows "Coming soon"
      placeholders. Either create the consumable IAP products (Starter 50 /
      Popular 200 / Pro 500 / Mega 1000) or accept launching without credit
      top-ups on mobile (credits then come only from referrals/streaks/web).
- [ ] 🔴 **Season pass**: decide per-platform availability. It's admin-flag +
      RC-product gated — on iOS it MUST be an IAP product (Apple rejects web
      checkout for digital goods); the web/Paystack path is for web only.
- [ ] 🟡 RevenueCat webhook secret / env normalization re-checked in prod
      (the July fixes are merged; confirm webhook events land in
      payment_transactions after the first sandbox purchase).
- [ ] 🟡 `pay.edutu.org` DNS + SSL verified (billing return URLs).

## 3 · Backend / infra — mostly done, small tail

- [x] AI backend live on Render (deployed + verified 2026-07-23).
- [x] `DEEPSEEK_API_KEY` on Render (key …cc38, account active).
- [x] chat-proxy edge function v15 (classifier fix + voice refund).
- [x] Order-critical `token_source` migration applied.
- [x] Render `NODE_VERSION` bumped ≥ 20.16 (pdf parsing needs it).
- [ ] 🔴 **Top up DeepSeek balance** — ~$1 will not survive launch traffic.
      https://platform.deepseek.com → top up; set a balance alert.
- [ ] 🟡 `OPENROUTER_API_KEY` on Render — without it provider failover is
      inert and a DeepSeek outage degrades the coach to canned answers.
- [ ] 🟡 `BREVO_API_KEY` on Render — support/bug-report email forms depend on it.
- [ ] 🟡 Secret rotation (the long-standing manual item — rotate anything that
      ever landed in git history before the apps are public).
- [ ] 🟢 `GEMINI_API_KEY` + embeddings backfill to activate the recommendation
      engine (see docs/RECS-ACTIVATION-RUNBOOK.md) — recs currently heuristic.
- [ ] 🟢 `REDIS_URL` on Render (caching layer is coded, just needs the env).

## 4 · Product QA tail — 🟡 (flows never exercised in the July test pass)

- [ ] 🟡 **Sign-up flow end-to-end** on a production build (Clerk pk_live,
      email verification, onboarding, referral-code redemption).
- [ ] 🟡 **Guest mode** (browse without login → AuthWall gates).
- [ ] 🟡 **Voice mode** one careful run (orb, STT, TTS, credit refund on
      failure) — historically fragile, never verified this cycle.
- [ ] 🟡 **SSE streaming on a real device** — expo/fetch chunking is the one
      untested seam; if it buffers, chat silently falls back (works, but
      no token streaming).
- [ ] 🟡 Data quality: scraped `location` values containing deadline text
      ("Abuja Deadline: 3rd August") — fix in scraper or strip client-side.
- [ ] 🟢 Referral copy contradiction ("Give 10, get 10" vs "they get 5").
- [ ] 🟢 Deadlines screen ↔ saved-opportunities consistency re-check (F7/F11 —
      may already be healed by the rpc auth fix; re-verify once).

## 5 · Store consoles — 🔴 the paperwork

- [ ] 🔴 App Store Connect: listing, screenshots (6.7"/6.1"), privacy
      nutrition labels (accounts, user content, purchases, coarse location if
      any), sign-in reviewer account, export-compliance answer.
- [ ] 🔴 Play Console: listing, data-safety form, content rating
      questionnaire, target-audience declaration.
- [ ] 🔴 Review notes: include a TEST ACCOUNT (email+password) and one line
      explaining the AI coach + that payments use RevenueCat IAP.
- [ ] 🟡 Deep links: associated domains / assetlinks.json for edutu.org
      universal links (edutu:// scheme works; https links need the files).
- [ ] 🟢 Post-approval: staged rollout on Play (10% → 100%), phased release
      on iOS.

## 6 · Day-1 watch list (after release)

- AI error-rate dashboard will *appear* to step up — truncated streaming
  rounds log `status:"error"` on successful turns. Known artifact, not real.
- Watch `ai_usage_events` spend vs DeepSeek balance daily for the first week.
- Watch Render logs for 429 rate-limit pressure (the per-user limiter was
  easy to hit during QA) and PostgREST 42501s (would indicate a new RLS gap).
- First real IAP: confirm the RevenueCat webhook wrote a `payment_transactions`
  row and admin revenue reflects it in NGN.

---

*Backend state of record: main @ f44e80a (AI overhaul + season pass + user-trust
merged, 534 backend / 377 mobile tests green). Full QA findings:
`edutumobile/docs/QA-LIVE-TEST-PLAN.md`.*
