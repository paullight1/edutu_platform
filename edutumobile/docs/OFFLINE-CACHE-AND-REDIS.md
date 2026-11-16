# Opportunity caching — offline-first mobile cache + backend Redis

**Date:** 2026-07-08
**Fixes:** intermittent "not found / refresh" screen and the frequent offline (Globe) icon when opening an opportunity; slow first paint on the detail screen.

---

## TL;DR

There are **two** layers of caching, and they solve different problems. Redis is a
**server** — it cannot run inside the React Native app. So the split is:

| Layer | Where | What it fixes | Status |
|-------|-------|---------------|--------|
| **Persistent local cache** (AsyncStorage) | Mobile app | The flaky "not found" screen + offline icon; instant detail paint | ✅ **Done in code** (this change) |
| **Redis response cache** | Backend (`edutu-platform.onrender.com`) | Slow/cold-start API responses for *everyone*; DB load | ⚙️ **Already coded — just set `REDIS_URL`** |

You only have to *do* something for the Redis layer: provision an instance and set
one environment variable. The mobile fix ships with the app build.

---

## 1. What the bug actually was

Opening an opportunity called `getOpportunity(id)`, which is **network-first**
(12 s timeout → Supabase fallback) and cached **nothing per-opportunity**. The
detail screen only pre-painted from the *list snapshot*.

So when you opened an opportunity that was **not in the last-loaded list**
(deep link, push notification, home widget, a search result outside the main
feed) **and** the network was slow or unreachable, `getOpportunity` returned
`null` and the screen fell through to the `Globe` **"not found"** scaffold —
that is the "refresh screen" / offline icon you kept seeing. It was intermittent
because it depended on whether that opportunity happened to be in the snapshot
and on network timing (Render cold-starts make this much worse in production
builds).

## 2. The mobile fix (already applied)

`packages/core/src/services/opportunities.ts`

- New **per-id detail cache** in AsyncStorage (`edutu_opportunity_detail:<id>`):
  - `getCachedOpportunity(id)` — reads the last-known full record.
  - `persistOpportunityDetail(opportunity)` — writes it after every successful fetch.
- `getOpportunity(id)` now:
  1. fetches from the backend (persisting on success),
  2. falls back to Supabase (persisting on success),
  3. **and if both fail, returns the cached full record** instead of `null`.

`app/(app)/opportunities/[id].tsx`

- The detail screen paints instantly from the **per-id detail cache** first
  (covers deep-link / push / widget opens), then the list snapshot, then
  revalidates over the network. It never clobbers shown content with a `null`
  network result.

**Net effect:** once an opportunity has been opened once, it opens instantly and
works offline. A brand-new opportunity that has *never* been loaded and *can't*
reach the network is the only remaining case that can show the not-found
scaffold — which is correct behaviour.

No build config changes are needed; `@react-native-async-storage/async-storage`
is already a dependency. Just rebuild.

---

## 3. Backend Redis — how to set it up

> The code is **already written**. `src/common/cache/cache.service.ts` uses
> Redis when `REDIS_URL` is set and an in-memory map otherwise, and
> `opportunities.service.ts` already wraps the detail + list reads
> (`opps:detail:<id>`, TTL 60 s). `ioredis` is already in `package.json`.
> **Activation = provision Redis + set `REDIS_URL`. Nothing to code.**

### Option A — Render Key Value / Redis (same platform as the API)

1. Render dashboard → **New +** → **Key Value** (Render's managed Redis).
2. Name it `edutu-redis`, pick the region **matching the API service**
   (co-location keeps latency ~sub-ms), choose a plan (the free/starter tier is
   fine to begin).
3. After it provisions, copy the **Internal Key Value URL**
   (`redis://red-xxxxx:6379` — internal is free and faster than the external one).
4. Open the **API web service** → **Environment** → add:
   ```
   REDIS_URL = redis://red-xxxxx:6379
   ```
5. **Save, Deploy** the API service. On boot the logs should print:
   ```
   Cache backend: Redis
   ```
   (If you instead see `REDIS_URL set but ioredis not installed`, run
   `npm install` so the lockfile pulls `ioredis` — it is already declared.)

### Option B — Upstash (serverless Redis, works from anywhere)

1. Create a database at <https://upstash.com> (pick a region near Render).
2. Copy the **`rediss://` connection string** (note the double-s — TLS).
3. Set `REDIS_URL` to that string on the API service and redeploy.
   `ioredis` handles `rediss://` TLS automatically; no extra config.

### Verify it works

```bash
# First call warms the cache; second should be noticeably faster and identical.
curl -s -o /dev/null -w "%{time_total}s\n" https://edutu-platform.onrender.com/opportunities/<some-id>
curl -s -o /dev/null -w "%{time_total}s\n" https://edutu-platform.onrender.com/opportunities/<some-id>
```

Or, if the Redis provider gives you a CLI, watch keys appear:

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'opps:*'
```

You should see keys like `opps:detail:<id>`. They auto-expire (TTL 60 s for
detail) and are cleared on any opportunity write via `delByPrefix("opps:")`,
so stale data is not a concern.

### Tuning (optional)

- TTLs live in `opportunities.service.ts` (`this.cache.wrap(key, <seconds>, run)`).
  Bump `opps:detail:` from `60` if opportunities change rarely and you want
  fewer DB hits; lower it if editors need edits to appear faster.
- The service already invalidates on writes, so a longer TTL is safe.

---

## 4. Why not "Redis in the app"?

Redis is a networked server process. A mobile client can't embed one; the
in-app equivalent of a cache is persistent local storage (AsyncStorage/MMKV),
which is exactly what section 2 implements. The two layers compose:

```
[ Detail screen ]
   → getCachedOpportunity()        ← instant paint, works offline   (AsyncStorage, on-device)
   → getOpportunity() → backend    ← fast shared response           (Redis, server-side)
                       → Supabase   ← source of truth
```

---

## Checklist

- [x] Mobile per-id detail cache + offline fallback (this change) — rebuild the app.
- [ ] Provision Redis (Render Key Value **or** Upstash).
- [ ] Set `REDIS_URL` on the API service and redeploy.
- [ ] Confirm `Cache backend: Redis` in the API boot logs.
- [ ] (Optional) Tune `opps:detail:` TTL.
