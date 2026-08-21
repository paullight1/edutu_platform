# Edutu Master Engine Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the security, correctness, cost, ranking, source-control, rate-limit, and runtime-truthfulness defects found in the August 21 Edutu Engine audit.

**Architecture:** Preserve the NestJS/Supabase engine and add focused boundaries around unsafe or overly implicit behavior. Security/trust changes fail closed; optional AI features fail soft; uncertainty remains explicit instead of being converted into confident values.

**Tech Stack:** TypeScript, NestJS, Jest, Node `http`/`https`/`dns`, Supabase, Drizzle/PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-08-21-edutu-master-engine-hardening-design.md`

## Global Constraints

- Work only on `feat/5of5-execution`; do not write to `main`.
- Test-first for every behavior change.
- Do not weaken live opportunity visibility (`active + verified + not expired`).
- Do not add a new external dependency when Node or existing repository primitives suffice.
- Unknown data must stay unknown; never invent USD, scholarship type, verification, or zero AI cost.
- Production mock-success behavior is forbidden.
- External/live production evidence remains gated.

---

### Task 1: Safe binary image egress

**Files:**
- Create: `backend/services/services/api/src/scraper/safe-image-fetcher.spec.ts`
- Create: `backend/services/services/api/src/scraper/safe-image-fetcher.ts`
- Modify: `backend/services/services/api/src/scraper/scraper.service.ts`

**Interfaces:**
- Produces: `fetchSafeImage(rawUrl, options?) -> Promise<{ buffer: Buffer; contentType: string; extension: string; sha256: string; finalUrl: string }>`.
- Consumes: `isGlobalUnicastAddress()` from `scraper-egress.service.ts`.

- [ ] **Step 1: Write failing security tests**

```ts
it("rejects a private resolved address", async () => {
  await expect(fetchSafeImage("https://images.example/a.png", {
    resolveHost: async () => [{ address: "127.0.0.1", family: 4 }],
  })).rejects.toThrow("safe image");
});

it("rejects a redirect that resolves private", async () => {
  // first response redirects; second host resolves to 10.0.0.1
});

it("rejects a non-image content type and an oversized image", async () => {
  // transport fixture returns text/html, then > maxBytes
});
```

- [ ] **Step 2: Run focused Jest and verify RED**

```bash
npm test -- --runInBand src/scraper/safe-image-fetcher.spec.ts
```

Expected: FAIL because `safe-image-fetcher` does not exist.

- [ ] **Step 3: Implement minimal safe fetcher**

```ts
export async function fetchSafeImage(
  rawUrl: string,
  options: SafeImageFetchOptions = {},
): Promise<SafeImageFetchResult> {
  // validate http/https authority, resolve every hop, require global IPs,
  // pin socket address, cap redirects/bytes/time, require image MIME,
  // hash bytes and return normalized extension.
}
```

- [ ] **Step 4: Verify focused tests GREEN**

```bash
npm test -- --runInBand src/scraper/safe-image-fetcher.spec.ts
```

- [ ] **Step 5: Replace raw image axios download and hot-path bucket creation**

```ts
const image = await fetchSafeImage(imageUrl, { timeoutMs: 10_000 });
const filename = `${image.sha256}.${image.extension}`;
await this.supabase.storage.from("opportunities_images").upload(
  filename,
  image.buffer,
  { contentType: image.contentType, upsert: true },
);
```

- [ ] **Step 6: Run scraper suites and lint**

```bash
npm test -- --runInBand src/scraper/safe-image-fetcher.spec.ts src/scraper/scraper.service.spec.ts src/scraper/scraper-egress.service.spec.ts
npm run lint
```

---

### Task 2: Truthful snapshots and uncertainty-preserving normalization

**Files:**
- Modify: `backend/services/services/api/src/opportunities/opportunity-static-snapshot.ts`
- Modify: `backend/services/services/api/src/opportunities/opportunity-static-snapshot.spec.ts`
- Modify: `backend/services/services/api/src/scraper/scraper.service.spec.ts`
- Modify: `backend/services/services/api/src/scraper/scraper.service.ts`

**Interfaces:**
- Snapshot loader accepts the committed `{ opportunities: [...] }` envelope.
- Public snapshot rows must pass `isPublicOpportunityRow` with verified status.
- `parseAmount()` returns `{ stipend: number | null; currency: string | null }`.
- Unknown inferred opportunity type stays `unknown`/reviewable.

- [ ] **Step 1: Add failing snapshot-envelope and trust tests**

```ts
expect(loadStaticOpportunitySnapshot({ opportunities: [verifiedRow] })).toHaveLength(1);
expect(loadStaticOpportunitySnapshot({ opportunities: [activeWithoutVerification] })).toHaveLength(0);
```

- [ ] **Step 2: Add failing amount/type uncertainty tests**

```ts
expect((service as any).parseAmount("5000 CAD")).toEqual({ stipend: 5000, currency: "CAD" });
expect((service as any).parseAmount("5000")).toEqual({ stipend: 5000, currency: null });
expect((service as any).parseAmount(null)).toEqual({ stipend: null, currency: null });
expect((service as any).toAllowedType("mystery")).toBe("unknown");
```

- [ ] **Step 3: Run focused tests and verify RED**

```bash
npm test -- --runInBand src/opportunities/opportunity-static-snapshot.spec.ts src/scraper/scraper.service.spec.ts
```

- [ ] **Step 4: Implement envelope/trust and normalization fixes**

```ts
const rows = Array.isArray(input)
  ? input
  : Array.isArray(input?.opportunities)
    ? input.opportunities
    : Array.isArray(input?.data)
      ? input.data
      : [];

return rows.filter(isPublicOpportunityRow);
```

```ts
private toAllowedType(type: string): string {
  return ALLOWED_OPPORTUNITY_TYPES.has(type) ? type : "unknown";
}
```

- [ ] **Step 5: Verify focused tests GREEN**

```bash
npm test -- --runInBand src/opportunities/opportunity-static-snapshot.spec.ts src/scraper/scraper.service.spec.ts
```

---

### Task 3: Accurate AI cost accounting and compact token ceilings

**Files:**
- Modify: `backend/services/services/api/src/ai/ai.service.ts`
- Create/modify: `backend/services/services/api/src/ai/ai-cost-policy.spec.ts`

**Interfaces:**
- Price lookup key is `provider:model`.
- Unknown prices yield `null`/unpriced, never `0`.
- `opportunities.rerank` receives a small explicit output-token cap.

- [ ] **Step 1: Add failing price identity tests**

```ts
expect(estimateCostUsd("openrouter", "deepseek/deepseek-chat", 1000, 500, 1500)).toBeGreaterThan(0);
expect(estimateCostUsd("openrouter", "unknown/model", 1000, 500, 1500)).toBeNull();
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- --runInBand src/ai/ai-cost-policy.spec.ts
```

- [ ] **Step 3: Implement provider+model pricing and route cap**

```ts
const MODEL_PRICES = {
  "deepseek:deepseek-chat": { input: 0.27, output: 1.1 },
  "openrouter:deepseek/deepseek-chat": { input: 0.27, output: 1.1 },
} as const;
```

```ts
"opportunities.rerank": {
  // existing provider/model fields
  maxOutputTokens: 768,
}
```

- [ ] **Step 4: Verify AI focused suites GREEN**

```bash
npm test -- --runInBand src/ai/ai-cost-policy.spec.ts src/ai/ai-fallback.spec.ts src/ai/ai-chat-stream.spec.ts
```

---

### Task 4: Real bidirectional reranking with smaller prompts

**Files:**
- Modify: `backend/services/services/api/src/opportunities/opportunity-ranking.service.ts`
- Create/modify: `backend/services/services/api/src/opportunities/opportunity-ranking.rerank.spec.ts`

**Interfaces:**
- Hard eligibility remains outside AI.
- AI can move the soft score both up and down using a bounded blend.
- Candidate payload uses normalized fields and a capped excerpt, not full descriptions.

- [ ] **Step 1: Add failing demotion and prompt-size tests**

```ts
expect(await rerank(candidateWith90, aiScore20)).toHaveProperty("match", 62);
expect(capturedPrompt).not.toContain(longTailBeyondExcerptLimit);
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- --runInBand src/opportunities/opportunity-ranking.rerank.spec.ts
```

- [ ] **Step 3: Implement bounded blend without `Math.max(original, blend)`**

```ts
const blended = Math.round(item.match * 0.6 + ranked.score * 0.4);
match: Math.max(0, Math.min(100, blended));
```

- [ ] **Step 4: Compact candidate prompt data**

```ts
summary: (item.description ?? "").replace(/\s+/g, " ").slice(0, 320),
```

- [ ] **Step 5: Verify focused ranking suites GREEN**

```bash
npm test -- --runInBand src/opportunities/opportunity-ranking.rerank.spec.ts src/opportunities/recommendation-blender.spec.ts src/opportunities/profile-fit.util.spec.ts
```

---

### Task 5: Expand the source control plane

**Files:**
- Modify: `backend/services/services/api/src/scraper/scraper.controller.ts`
- Modify: `backend/services/services/api/src/scraper/scraper.service.ts`
- Create/modify: `backend/services/services/api/src/scraper/scraper-source-admin.spec.ts`

**Interfaces:**
- `addSource()` and `updateSource()` accept validated source metadata and config understood by the crawler.
- Existing clients that only toggle `enabled` continue to work.

- [ ] **Step 1: Add failing patch/source-config tests**

```ts
await service.updateSource(7, {
  enabled: true,
  priority: 2,
  tier: 1,
  category: "scholarship",
  config: { item_selector: "article" },
});
expect(updatePayload).toMatchObject({ priority: 2, tier: 1 });
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- --runInBand src/scraper/scraper-source-admin.spec.ts
```

- [ ] **Step 3: Implement validated allowlisted patch fields**

```ts
const update = pickDefined(body, [
  "name", "url", "enabled", "priority", "tier", "category",
  "parent_id", "is_group", "config",
]);
```

- [ ] **Step 4: Verify GREEN and controller compatibility**

```bash
npm test -- --runInBand src/scraper/scraper-source-admin.spec.ts src/scraper/scraper.service.spec.ts
```

---

### Task 6: Database-authoritative API rate limiting

**Files:**
- Modify: `backend/services/services/api/src/edutu-api/edutu-api-usage.service.ts`
- Modify: `backend/services/services/api/src/edutu-api/edutu-api-usage.service.spec.ts`
- Add canonical migration under: `backend/services/services/api/supabase/migrations/`

**Interfaces:**
- `reserveRateLimit()` becomes async and atomically reserves one request in a shared minute bucket.
- Guard/interceptor callers await it.

- [ ] **Step 1: Add failing cross-instance/shared-bucket test**

```ts
const a = new EdutuApiUsageService();
const b = new EdutuApiUsageService();
// shared mocked DB bucket reaches limit across a + b, proving no process-local authority.
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- --runInBand src/edutu-api/edutu-api-usage.service.spec.ts src/edutu-api/edutu-api-key.guard.spec.ts
```

- [ ] **Step 3: Add atomic minute-bucket migration and reservation query**

```sql
create table if not exists api_rate_limit_buckets (
  consumer_id uuid not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (consumer_id, window_start)
);
```

- [ ] **Step 4: Await reservation in request guard and verify GREEN**

```bash
npm test -- --runInBand src/edutu-api/edutu-api-usage.service.spec.ts src/edutu-api/edutu-api-key.guard.spec.ts src/edutu-api/edutu-api-metering.pipeline.spec.ts
```

---

### Task 7: Production runtime truthfulness

**Files:**
- Modify: `backend/services/services/api/src/scraper/scraper.service.ts`
- Modify: `backend/services/services/api/src/scraper/scraper.service.spec.ts`

**Interfaces:**
- Production/unset engine mode without Supabase returns explicit failure/degraded state.
- Mock scrape succeeds only when `ENGINE_MODE=test|development` (or `NODE_ENV=test`).

- [ ] **Step 1: Add failing production-misconfiguration test**

```ts
process.env.NODE_ENV = "production";
delete process.env.SUPABASE_URL;
expect(await service.runScraper({ allSources: true })).toMatchObject({
  success: false,
  error: expect.stringContaining("not configured"),
});
```

- [ ] **Step 2: Verify RED, implement mode gate, then verify GREEN**

```bash
npm test -- --runInBand src/scraper/scraper.service.spec.ts
```

---

### Task 8: Final verification and CI separation

**Files:**
- No production files unless verification exposes a regression in this scope.

- [ ] **Step 1: Run all modified subsystem tests**

```bash
npm test -- --runInBand src/scraper src/opportunities src/ai src/edutu-api
```

- [ ] **Step 2: Run backend lint and build**

```bash
npm run lint
npm run build
```

- [ ] **Step 3: Inspect PR CI and classify failures**

Any creator/marketplace or unrelated feature failure that predates these commits is reported separately. Engine failures are fixed before completion is claimed.

- [ ] **Step 4: Re-read this plan and the design spec**

Verify each requirement has code and test evidence. Do not claim live deployment, distributed production behavior, or production database migration success without genuine external evidence.