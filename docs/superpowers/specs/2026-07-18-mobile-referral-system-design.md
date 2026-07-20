# Mobile Referral System — Design

**Date:** 2026-07-18
**Scope:** `edutumobile/` (+ Supabase). No changes to the Nest/Drizzle backend.

## Goal

Let users invite friends. When an invited user signs up **and completes their
profile**, both sides earn credits:

- **Referrer:** +10 credits, once **per referred friend** (not once ever).
- **Referee (new user):** +5 bonus credits on top of the existing +5
  `PROFILE_COMPLETE` reward.

Attribution travels two ways (both supported):

1. **Share link** — `https://edutu.org/invite?code=CODE` (and `edutu://invite?code=CODE`)
   pre-fills the code on the sign-up screen.
2. **Manual code** — an optional "Have a referral code?" field on sign-up, for
   fresh installs where the link is lost.

## Why this shape

The app already has a **secure server-side credit system** (Supabase, migration
015): `profiles.credits`, the `payment_transactions` ledger, and
`SECURITY DEFINER` RPCs (`award_engagement_credit`, `claim_daily_credit`) with
server-fixed amounts and dedup. `REFER_FRIEND: 10` is already reserved there but
is only a self-serve "claim once" stub with **no referrer↔referee linkage**.

We extend that exact pattern rather than introducing a Nest webhook or a second
DB. Credits already live in Supabase and the Wallet screen reads them from
Supabase — keeping referral there means one rail, one security model, one
ledger.

## Architecture (Approach A — Supabase-only)

### Data (migration `032_referral_system.sql`)

- `profiles.referral_code TEXT UNIQUE` — each user's shareable code (lazy-created).
- `referrals` table — source of truth for attribution:
  | column | notes |
  |---|---|
  | `id uuid pk` | |
  | `referrer_id text` | Clerk id of the inviter |
  | `referee_id text UNIQUE` | Clerk id of the invited user — **unique ⇒ one attribution per referee** |
  | `code text` | the code that was redeemed |
  | `status text` | `pending` → `completed` |
  | `reward_referrer int`, `reward_referee int` | amounts granted at settlement |
  | `created_at`, `completed_at` | |
  - RLS: `SELECT` allowed when `auth.uid()` is the referrer **or** referee. No
    client `INSERT`/`UPDATE` — writes only through the RPCs below.

### RPCs (all `SECURITY DEFINER`, `authenticated`-only)

- `get_or_create_my_referral_code() → text` — returns the caller's code,
  generating an 8-char code (uppercase md5 slice) with a collision-retry loop on
  first call.
- `redeem_referral(p_code text) → jsonb {status}` — records the caller as a
  referee of the code's owner. Returns a status:
  - `invalid_code` — no such code
  - `self` — caller owns the code
  - `already_redeemed` — caller already has a referral row
  - `too_late` — caller has already claimed `PROFILE_COMPLETE` (can't attribute
    an already-established account)
  - `pending` — recorded; reward settles at profile completion
- **Settlement** happens inside the existing `award_engagement_credit`: when a
  **first-time** `PROFILE_COMPLETE` is granted to a user who has a `pending`
  referral, in the same transaction we mark it `completed`, credit the referrer
  +10 (`payment_transactions` tag `referral:<referee_id>`, deduped by uniqueness
  of the referral row) and the referee +5 (`referral_bonus`). Server-authoritative,
  atomic, immune to client tampering.

### Client (mobile)

- `packages/core/src/services/referrals.ts` — thin RPC wrappers:
  `getMyReferralCode`, `redeemReferral`, `getReferralStats`, `buildReferralLink`.
- `packages/core/src/hooks/useReferral.ts` — exposes `code`, `stats`, `share()`,
  `redeem()`; guards null user.
- `app/invite.tsx` — deep-link capture route. Reads `?code=`, stashes it in
  AsyncStorage (`pendingReferralCode`), redirects to sign-up (or the invite
  screen if already signed in).
- `app/(auth)/sign-up.tsx` — optional collapsible "Have a referral code?" field,
  pre-filled from the AsyncStorage stash; on submit the code is persisted to
  AsyncStorage so it survives verification.
- `app/(app)/_layout.tsx` — a ref-guarded `ReferralRedemption` effect (sibling to
  the existing `DailyLoginRewards`) that, once authenticated, reads the stashed
  code, calls `redeem_referral`, and clears the stash on any terminal response.
- `app/(app)/referrals.tsx` — "Invite friends" screen: the user's code, a share
  button, and stats (friends joined / pending / credits earned). Linked from the
  profile screen (replaces the `REFER_FRIEND` TODO) and Wallet.

## Anti-abuse

- Amounts are server-fixed; the client can never assert a credit amount.
- `referee_id UNIQUE` + the `too_late` gate ⇒ a user can be attributed to at most
  one referrer, and only while genuinely new.
- Self-referral blocked (`self`).
- Referrer reward is deduped per referee via the ledger tag `referral:<referee_id>`.
- Settlement is gated on the *first* `PROFILE_COMPLETE`, filtering throwaway
  accounts.

## Explicitly out of scope (v1)

- Deferred deep-link install attribution (Branch/AppsFlyer). The manual code
  field is the deliberate fallback for fresh installs.
- Milestone/tiered bonuses and free-Pro rewards.
- Web-app referral UI (mobile-only for now).
- Referrer reward caps (uncapped in v1).

## Verification

- Migration: apply to a Supabase branch; exercise `redeem_referral` for each
  status; confirm settlement credits both ledgers exactly once on
  `PROFILE_COMPLETE`.
- Mobile: existing jest suite green; new unit tests for the service (status
  mapping) and link building.
