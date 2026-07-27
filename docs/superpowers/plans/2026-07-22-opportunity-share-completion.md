# Opportunity Share Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every shared opportunity read as complete (AI fills missing benefits/eligibility/summary, grounded, never fabricating deadlines) and make every `edutu.org/opportunity/*` link unfurl with an opportunity-specific image instead of the generic Edutu icon.

**Architecture:** Two independent backend workstreams plus one edge-function tweak. (A) A new `OpportunityShareEnrichService` fills only-missing share fields via the existing `AiService.generateJson`, caches the result into `metadata` with a provenance marker, and is invoked from `OpportunitiesService.ensureShareCard` before the share text + card are built — so text, card, and OG all improve from one AI call. (B) The share-text builder gains a conditional Deadline row and a new "Who Can Apply" section. (C) The OG image resolvers (backend `og.controller` + Netlify edge fn) never fall to the generic icon: they resolve source flyer → image → share card, generating the branded card on demand when nothing else exists.

**Tech Stack:** NestJS + TypeScript, Jest (`@jest/globals`), Drizzle/`@supabase/supabase-js`, DeepSeek via `AiService`, Deno (Netlify edge function), Zod.

## Global Constraints

- Backend lint is a real CI check: `--max-warnings 0`. Run `npm run lint` in `backend/services/services/api` before committing.
- Backend tests run on Node 20; locally use `npx jest <file> --maxWorkers=2`.
- **Deadlines are never AI-generated.** The deadline is only ever the real `close_date`/`deadline` value. When absent, the share text omits the Deadline row entirely (per approved spec).
- AI **never overwrites** real existing data — it only fills empty fields.
- AI output is grounded strictly in `title + summary + description + organization`; ungroundable fields are omitted, not guessed.
- Enrichment is best-effort: any AI failure is swallowed (log + proceed with real-only data). Sharing must never break because AI was slow/unavailable.
- Never `git stash` (concurrent sessions share this working tree). Use `git show HEAD:path` to inspect original file state.
- Git via the shell currently fails with "Unable to read current working directory" (macOS Desktop TCC lockout). If a `git` step fails that way, prefix with `cd ~ &&` and use `git -C /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder ...`; if it still fails, note it and let the user run the commit via the `!` prompt prefix. File Read/Write/Edit tools are unaffected.

---

### Task 1: Share text — conditional Deadline + "Who Can Apply" section

**Files:**
- Modify: `backend/services/services/api/src/opportunities/opportunity-share-text.ts`
- Test: `backend/services/services/api/src/opportunities/opportunity-share-text.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildOpportunityShareText(opportunity, shareUrl)` — unchanged signature. New behavior: Deadline row only when a real deadline exists; a `*Who Can Apply:*` bulleted section when eligibility data exists. Adds internal helper `getEligibility(opportunity: Record<string, any>): string[]` (module-private).

- [ ] **Step 1: Write the failing tests**

Add these two `it` blocks inside the existing `describe("opportunity share text", ...)` in `opportunity-share-text.spec.ts`:

```ts
  it("omits the Deadline row when the opportunity has no deadline", () => {
    const text = buildOpportunityShareText(
      {
        title: "Rolling Community Grant",
        organization: "Edutu",
        category: "Grant",
        summary: "An always-open community grant.",
      },
      "/opportunity/rolling",
    );

    expect(text).not.toContain("*Deadline:*");
    expect(text).toContain("- *Type:* Grant");
    expect(text).toContain("*Apply here:*");
  });

  it("renders a Who Can Apply section from eligibility data", () => {
    const text = buildOpportunityShareText(
      {
        title: "African Youth Fellowship",
        organization: "Edutu",
        category: "Fellowship",
        close_date: "2026-09-30",
        metadata: {
          eligibility: [
            "Open to African nationals aged 18-30",
            "Must have a completed undergraduate degree",
          ],
        },
      },
      "/opportunity/ayf",
    );

    expect(text).toContain("*Who Can Apply:*");
    expect(text).toContain("- Open to African nationals aged 18-30");
    expect(text).toContain("- Must have a completed undergraduate degree");
    expect(text).toContain("- *Deadline:* 30 September 2026");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~ && cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest opportunity-share-text --maxWorkers=2`
Expected: FAIL — new assertions fail (Deadline still present / "Who Can Apply" absent).

- [ ] **Step 3: Add the `getEligibility` helper**

Insert after `getGains` (around line 124) in `opportunity-share-text.ts`:

```ts
function getEligibility(opportunity: OpportunityRecord): string[] {
  const metadata = asRecord(opportunity.metadata);

  // 1. An explicit bullet list (real or AI-filled) wins.
  const listed = toStringArray(
    opportunity.eligibility_bullets ??
      metadata.eligibility_bullets ??
      (Array.isArray(opportunity.eligibility)
        ? opportunity.eligibility
        : Array.isArray(metadata.eligibility)
          ? metadata.eligibility
          : undefined),
  );
  if (listed.length > 0) {
    return listed.map((item) => truncateText(item, 120)).slice(0, 3);
  }

  // 2. Structured eligibility object → a single concise line.
  const eligibility = asRecord(opportunity.eligibility ?? metadata.eligibility);
  const countries = eligibility.countries;
  if (Array.isArray(countries) && countries.length > 0) {
    const shown = countries.slice(0, 4).map((c) => cleanText(c)).filter(Boolean);
    const suffix = countries.length > 4 ? ` +${countries.length - 4} more` : "";
    if (shown.length) return [`Open to applicants from ${shown.join(", ")}${suffix}`];
  }
  const audience = getTargetAudience(opportunity);
  return audience ? [truncateText(audience, 120)] : [];
}
```

- [ ] **Step 4: Make the Deadline row conditional and append the eligibility section**

Replace the deadline computation + facts/gains block in `buildOpportunityShareText` (currently lines 159–184) with:

```ts
  const rawDeadline = cleanText(opportunity.close_date || opportunity.deadline);
  const gains = getGains(opportunity);
  const eligibility = getEligibility(opportunity);

  const lines: string[] = [`*${title}*`];

  if (summary) {
    lines.push("", `_${summary}_`);
  }

  const facts: string[] = [];
  if (type) facts.push(`- *Type:* ${type}`);
  if (duration) facts.push(`- *Duration:* ${duration}`);
  if (audience) facts.push(`- *Target Audience:* ${audience}`);
  // Deadlines are never fabricated — only shown when the opportunity carries one.
  if (rawDeadline) facts.push(`- *Deadline:* ${formatDeadline(rawDeadline)}`);
  lines.push("", ...facts);

  if (eligibility.length > 0) {
    lines.push("", "*Who Can Apply:*", "", ...eligibility.map((item) => `- ${item}`));
  }

  if (gains.length > 0) {
    lines.push("", "*What You'll Gain:*", "", ...gains.map((gain) => `- ${gain}`));
  }
```

Note: remove the now-unused `const deadline = formatDeadline(...)` line and the old `const gains = getGains(...)` line (they are folded into the block above). Keep the trailing `lines.push("", "*Apply here:*", "", shareUrl); return lines.join("\n");`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ~ && cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest opportunity-share-text --maxWorkers=2`
Expected: PASS — all four tests green (two original + two new).

- [ ] **Step 6: Commit**

```bash
cd ~ && git -C /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder add backend/services/services/api/src/opportunities/opportunity-share-text.ts backend/services/services/api/src/opportunities/opportunity-share-text.spec.ts
git -C /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder commit -m "feat(share): eligibility section + honest conditional deadline in share text"
```

---

### Task 2: Enrichment helpers — prompt, schema, merge (pure, no AI)

**Files:**
- Create: `backend/services/services/api/src/opportunities/opportunity-share-enrich.ts`
- Test: `backend/services/services/api/src/opportunities/opportunity-share-enrich.spec.ts`

**Interfaces:**
- Consumes: nothing (pure functions over an opportunity record).
- Produces:
  - `type ShareEnrichment = { summary?: string; benefits?: string[]; eligibility?: string[] }`
  - `ShareEnrichmentSchema` (Zod) validating the AI JSON into `ShareEnrichment`.
  - `missingShareFields(opp): Array<"summary" | "benefits" | "eligibility">` — which enrichable fields are empty.
  - `shareEnrichSourceHash(opp): string` — sha1 of grounding inputs.
  - `buildShareEnrichPrompt(opp, missing): string` — the grounded prompt.
  - `mergeShareEnrichment(opp, ai, hash, model): { metadataPatch: Record<string, any> | null; filled: string[] }` — applies only-missing rule; `metadataPatch` is null when nothing changed. Later tasks rely on these exact names/return shapes.

- [ ] **Step 1: Write the failing tests**

Create `opportunity-share-enrich.spec.ts`:

```ts
import { describe, expect, it } from "@jest/globals";
import {
  ShareEnrichmentSchema,
  missingShareFields,
  shareEnrichSourceHash,
  buildShareEnrichPrompt,
  mergeShareEnrichment,
} from "./opportunity-share-enrich";

const thin = {
  id: "opp-1",
  title: "Moroccan Government Scholarship Programme 2026-27",
  summary: "A funded chance to pursue higher studies in Morocco.",
  description: "Full scholarship covering tuition and a monthly stipend.",
  organization: "Government of Morocco",
  close_date: "2026-07-22",
  metadata: {},
};

describe("opportunity share enrichment", () => {
  it("reports benefits + eligibility as missing on a thin opportunity", () => {
    expect(missingShareFields(thin).sort()).toEqual(["benefits", "eligibility"]);
  });

  it("reports nothing missing when data is already present", () => {
    const rich = {
      ...thin,
      metadata: {
        benefits: ["Full tuition"],
        eligibility: ["Open to international students"],
      },
    };
    expect(missingShareFields(rich)).toEqual([]);
  });

  it("hashes only the grounding inputs (stable across unrelated fields)", () => {
    const a = shareEnrichSourceHash(thin);
    const b = shareEnrichSourceHash({ ...thin, metadata: { share_card: { url: "x" } } });
    expect(a).toBe(b);
    const c = shareEnrichSourceHash({ ...thin, title: "Different" });
    expect(c).not.toBe(a);
  });

  it("builds a grounded prompt that names only the missing fields", () => {
    const prompt = buildShareEnrichPrompt(thin, ["benefits", "eligibility"]);
    expect(prompt).toContain("Moroccan Government Scholarship Programme 2026-27");
    expect(prompt).toContain("benefits");
    expect(prompt).toContain("eligibility");
    expect(prompt.toLowerCase()).toContain("do not invent");
    expect(prompt.toLowerCase()).not.toContain("deadline");
  });

  it("validates and coerces AI output, dropping blanks", () => {
    const parsed = ShareEnrichmentSchema.parse({
      benefits: ["  Full tuition  ", "", "Monthly stipend"],
      eligibility: ["International students"],
      extra: "ignored",
    });
    expect(parsed.benefits).toEqual(["Full tuition", "Monthly stipend"]);
    expect(parsed.eligibility).toEqual(["International students"]);
  });

  it("merges only the missing fields and never overwrites real data", () => {
    const opp = {
      ...thin,
      metadata: { benefits: ["Existing benefit"] }, // benefits present, eligibility missing
    };
    const { metadataPatch, filled } = mergeShareEnrichment(
      opp,
      { benefits: ["AI benefit"], eligibility: ["AI eligibility"] },
      "hash123",
      "deepseek-chat",
    );
    expect(filled).toEqual(["eligibility"]);
    expect(metadataPatch?.benefits).toEqual(["Existing benefit"]); // untouched
    expect(metadataPatch?.eligibility).toEqual(["AI eligibility"]);
    expect(metadataPatch?.ai_enriched).toMatchObject({
      sourceHash: "hash123",
      model: "deepseek-chat",
      fields: ["eligibility"],
    });
  });

  it("returns a null patch when the AI filled nothing groundable", () => {
    const opp = { ...thin, metadata: { benefits: ["b"], eligibility: ["e"] } };
    const { metadataPatch, filled } = mergeShareEnrichment(
      opp,
      { benefits: [], eligibility: [] },
      "hash123",
      "deepseek-chat",
    );
    expect(filled).toEqual([]);
    // Nothing to fill, but the attempt hash is still recorded so we don't retry forever.
    expect(metadataPatch?.ai_enriched?.sourceHash).toBe("hash123");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~ && cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest opportunity-share-enrich --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `opportunity-share-enrich.ts`:

```ts
import { createHash } from "crypto";
import { z } from "zod";

type OpportunityRecord = Record<string, any>;

export type EnrichField = "summary" | "benefits" | "eligibility";

export interface ShareEnrichment {
  summary?: string;
  benefits?: string[];
  eligibility?: string[];
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function clean(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\s+/g, " ").trim()
    : "";
}

function cleanList(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from(new Set(source.map((v) => clean(v)).filter(Boolean)));
}

/** Trim + drop blanks + cap length; used to sanitize AI arrays. */
const BulletList = z
  .array(z.any())
  .optional()
  .transform((arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((v) => clean(v))
      .filter(Boolean)
      .slice(0, 5),
  );

export const ShareEnrichmentSchema = z
  .object({
    summary: z.any().optional().transform((v) => clean(v) || undefined),
    benefits: BulletList,
    eligibility: BulletList,
  })
  .transform((v) => ({
    summary: v.summary,
    benefits: v.benefits && v.benefits.length ? v.benefits : undefined,
    eligibility: v.eligibility && v.eligibility.length ? v.eligibility : undefined,
  }));

function hasSummary(opp: OpportunityRecord): boolean {
  const metadata = asRecord(opp.metadata);
  return Boolean(clean(opp.summary || metadata.summary));
}

function hasBenefits(opp: OpportunityRecord): boolean {
  const metadata = asRecord(opp.metadata);
  return cleanList(opp.benefits ?? metadata.benefits).length > 0;
}

function hasEligibility(opp: OpportunityRecord): boolean {
  const metadata = asRecord(opp.metadata);
  if (cleanList(opp.eligibility ?? metadata.eligibility).length > 0) return true;
  const obj = asRecord(opp.eligibility ?? metadata.eligibility);
  if (Array.isArray(obj.countries) && obj.countries.length > 0) return true;
  return Boolean(clean(obj.audience || obj.target_audience));
}

export function missingShareFields(opp: OpportunityRecord): EnrichField[] {
  const missing: EnrichField[] = [];
  if (!hasSummary(opp)) missing.push("summary");
  if (!hasBenefits(opp)) missing.push("benefits");
  if (!hasEligibility(opp)) missing.push("eligibility");
  return missing;
}

export function shareEnrichSourceHash(opp: OpportunityRecord): string {
  return createHash("sha1")
    .update(
      JSON.stringify({
        title: clean(opp.title),
        summary: clean(opp.summary),
        description: clean(opp.description),
        organization: clean(opp.organization),
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

export function buildShareEnrichPrompt(
  opp: OpportunityRecord,
  missing: EnrichField[],
): string {
  const facts = [
    `Title: ${clean(opp.title) || "(none)"}`,
    `Organization: ${clean(opp.organization) || "(none)"}`,
    `Category: ${clean(opp.category) || "(none)"}`,
    `Summary: ${clean(opp.summary) || "(none)"}`,
    `Description: ${clean(opp.description) || "(none)"}`,
  ].join("\n");

  return [
    "You are completing missing fields for an education/career opportunity so it can be shared clearly.",
    "Use ONLY the information provided below. Do NOT invent facts, numbers, dates, or requirements that are not supported by the text.",
    "If a requested field cannot be grounded in the provided text, return an empty array for it (or omit it).",
    "Never output a deadline or date — that is handled separately.",
    "",
    "OPPORTUNITY:",
    facts,
    "",
    `Return STRICT JSON with only these keys: ${missing.join(", ")}.`,
    '- "benefits": 2-4 short phrases of what an applicant gains (each under 15 words).',
    '- "eligibility": 2-4 short phrases describing who can apply (each under 15 words).',
    '- "summary": one plain-language sentence (under 40 words).',
    "Only include the keys that were requested. Output JSON only, no prose.",
  ].join("\n");
}

export function mergeShareEnrichment(
  opp: OpportunityRecord,
  ai: ShareEnrichment,
  hash: string,
  model: string,
): { metadataPatch: Record<string, any> | null; filled: EnrichField[] } {
  const metadata = asRecord(opp.metadata);
  const patch: Record<string, any> = { ...metadata };
  const filled: EnrichField[] = [];

  if (!hasSummary(opp) && ai.summary) {
    patch.summary = ai.summary;
    filled.push("summary");
  }
  if (!hasBenefits(opp) && ai.benefits && ai.benefits.length) {
    patch.benefits = ai.benefits;
    filled.push("benefits");
  }
  if (!hasEligibility(opp) && ai.eligibility && ai.eligibility.length) {
    patch.eligibility = ai.eligibility;
    filled.push("eligibility");
  }

  // Always record the attempt so we don't re-enrich the same content forever,
  // even when the AI had nothing groundable to add.
  patch.ai_enriched = {
    sourceHash: hash,
    model,
    fields: filled,
    createdAt: new Date().toISOString(),
  };

  return { metadataPatch: patch, filled };
}
```

Note: `patch.summary` is written at `metadata.summary` (not the top-level column). The share-text builder and card already read `metadata.summary` as a fallback, and the OG description reads `opp.summary || opp.description` — see Task 3 for making the top-level summary reflect the enriched value where needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~ && cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest opportunity-share-enrich --maxWorkers=2`
Expected: PASS — all seven tests green.

- [ ] **Step 5: Commit**

```bash
cd ~ && git -C /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder add backend/services/services/api/src/opportunities/opportunity-share-enrich.ts backend/services/services/api/src/opportunities/opportunity-share-enrich.spec.ts
git -C /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder commit -m "feat(share): grounded AI enrichment helpers (prompt, schema, only-missing merge)"
```

---

### Task 3: Enrichment service + wire into ensureShareCard

**Files:**
- Create: `backend/services/services/api/src/opportunities/opportunity-share-enrich.service.ts`
- Test: `backend/services/services/api/src/opportunities/opportunity-share-enrich.service.spec.ts`
- Modify: `backend/services/services/api/src/opportunities/opportunities.service.ts` (inject service; call in `ensureShareCard`, lines 930–952)
- Modify: `backend/services/services/api/src/opportunities/opportunities.module.ts` (register provider)
- Modify: `backend/services/services/api/src/ai/ai.service.ts` (add `opportunities.share_enrich` route to `DEFAULT_ROUTES`)
- Modify: `backend/services/services/api/src/ai/ai.types.ts` (add `"opportunities.share_enrich"` to the `AiFeature` union)

**Interfaces:**
- Consumes: `AiService.generateJson`, helpers from Task 2, `OpportunityRecord`.
- Produces: `OpportunityShareEnrichService.ensureEnriched(opp): Promise<OpportunityRecord>` — returns the opportunity with `metadata` (and top-level `summary`) enriched in memory; persists the patch to the `opportunities` row when anything was filled. Never throws. `OpportunitiesService.ensureShareCard` now enriches before building text/card.

- [ ] **Step 1: Write the failing test**

Create `opportunity-share-enrich.service.spec.ts`:

```ts
import { describe, expect, it, jest } from "@jest/globals";
import { OpportunityShareEnrichService } from "./opportunity-share-enrich.service";

function makeService(aiJson: any) {
  const aiService = { generateJson: jest.fn(async () => aiJson) } as any;
  const service = new OpportunityShareEnrichService(aiService);
  // No Supabase in unit tests → persistence is a no-op, enrichment stays in-memory.
  (service as any).supabase = null;
  return { service, aiService };
}

const thin = {
  id: "opp-1",
  title: "Moroccan Government Scholarship 2026-27",
  summary: "A funded chance to study in Morocco.",
  description: "Covers tuition and a monthly stipend for international students.",
  organization: "Government of Morocco",
  metadata: {},
};

describe("OpportunityShareEnrichService", () => {
  it("fills missing benefits + eligibility from AI output", async () => {
    const { service, aiService } = makeService({
      benefits: ["Full tuition", "Monthly stipend"],
      eligibility: ["Open to international students"],
    });
    const result = await service.ensureEnriched(thin);
    expect(aiService.generateJson).toHaveBeenCalledTimes(1);
    expect(result.metadata.benefits).toEqual(["Full tuition", "Monthly stipend"]);
    expect(result.metadata.eligibility).toEqual(["Open to international students"]);
    expect(result.metadata.ai_enriched.fields.sort()).toEqual([
      "benefits",
      "eligibility",
    ]);
  });

  it("skips the AI call when nothing is missing", async () => {
    const rich = {
      ...thin,
      metadata: { benefits: ["b"], eligibility: ["e"] },
    };
    const { service, aiService } = makeService({});
    const result = await service.ensureEnriched(rich);
    expect(aiService.generateJson).not.toHaveBeenCalled();
    expect(result).toBe(rich);
  });

  it("skips the AI call when a matching enrichment attempt is already cached", async () => {
    const cached = {
      ...thin,
      metadata: {
        ai_enriched: {
          sourceHash: require("./opportunity-share-enrich").shareEnrichSourceHash(
            thin,
          ),
          model: "deepseek-chat",
          fields: [],
          createdAt: "2026-07-22T00:00:00.000Z",
        },
      },
    };
    const { service, aiService } = makeService({ benefits: ["x"] });
    await service.ensureEnriched(cached);
    expect(aiService.generateJson).not.toHaveBeenCalled();
  });

  it("never throws when the AI call fails", async () => {
    const aiService = {
      generateJson: jest.fn(async () => {
        throw new Error("ai down");
      }),
    } as any;
    const service = new OpportunityShareEnrichService(aiService);
    (service as any).supabase = null;
    const result = await service.ensureEnriched(thin);
    expect(result).toBe(thin); // unchanged, no throw
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~ && cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest opportunity-share-enrich.service --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `opportunity-share-enrich.service.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AiService } from "../ai";
import {
  ShareEnrichmentSchema,
  buildShareEnrichPrompt,
  mergeShareEnrichment,
  missingShareFields,
  shareEnrichSourceHash,
} from "./opportunity-share-enrich";

type OpportunityRecord = Record<string, any>;

@Injectable()
export class OpportunityShareEnrichService {
  private readonly logger = new Logger(OpportunityShareEnrichService.name);
  private readonly supabase: SupabaseClient | null;

  constructor(private readonly aiService: AiService) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase =
      url && key
        ? createClient(url, key, { auth: { persistSession: false } })
        : null;
  }

  /**
   * Fills an opportunity's missing share fields (benefits / eligibility /
   * summary) with grounded AI output, once, cached. Best-effort: any failure
   * returns the opportunity unchanged so sharing never breaks.
   */
  async ensureEnriched(opportunity: OpportunityRecord): Promise<OpportunityRecord> {
    if (!opportunity?.id) return opportunity;

    const missing = missingShareFields(opportunity);
    if (missing.length === 0) return opportunity;

    const hash = shareEnrichSourceHash(opportunity);
    const metadata =
      opportunity.metadata && typeof opportunity.metadata === "object"
        ? opportunity.metadata
        : {};
    // Already attempted this exact content — don't re-spend on the same text.
    if (metadata.ai_enriched?.sourceHash === hash) return opportunity;

    let parsed;
    try {
      const raw = await this.aiService.generateJson<Record<string, unknown>>({
        feature: "opportunities.share_enrich",
        prompt: buildShareEnrichPrompt(opportunity, missing),
        responseMimeType: "application/json",
        temperature: 0.2,
        metadata: { opportunityId: opportunity.id },
      });
      if (!raw) return opportunity;
      parsed = ShareEnrichmentSchema.parse(raw);
    } catch (error) {
      this.logger.warn(
        `Share enrichment skipped for ${opportunity.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return opportunity;
    }

    const { metadataPatch, filled } = mergeShareEnrichment(
      opportunity,
      parsed,
      hash,
      "deepseek-chat",
    );
    if (!metadataPatch) return opportunity;

    await this.persist(opportunity.id, metadataPatch);

    // Reflect the enrichment in the in-memory record so the very next
    // share-text/card build (same request) uses it without a re-read.
    const enriched: OpportunityRecord = {
      ...opportunity,
      metadata: metadataPatch,
    };
    if (filled.includes("summary") && metadataPatch.summary) {
      enriched.summary = enriched.summary || metadataPatch.summary;
    }
    return enriched;
  }

  private async persist(
    id: string,
    metadataPatch: Record<string, any>,
  ): Promise<void> {
    if (!this.supabase) return;
    try {
      // Re-read to avoid clobbering a concurrent metadata write (share_card).
      const { data: latest } = await this.supabase
        .from("opportunities")
        .select("metadata")
        .eq("id", id)
        .maybeSingle();
      const latestMetadata =
        latest?.metadata && typeof latest.metadata === "object"
          ? latest.metadata
          : {};
      await this.supabase
        .from("opportunities")
        .update({
          metadata: { ...latestMetadata, ...metadataPatch },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    } catch (error) {
      this.logger.warn(
        `Could not persist enrichment for ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
```

- [ ] **Step 4: Add the AI route**

In `ai.types.ts`, add to the `AiFeature` union (after `"opportunities.rerank"`, line 15):

```ts
  | "opportunities.share_enrich"
```

In `ai.service.ts`, add to `DEFAULT_ROUTES` right after the `"opportunities.rerank"` block (around line 266):

```ts
  "opportunities.share_enrich": {
    provider: "deepseek",
    fallbackProvider: CHAT_FALLBACK_PROVIDER,
    model: "deepseek-chat",
    temperature: 0.2,
    responseMimeType: "application/json",
    isEnabled: true,
  },
```

- [ ] **Step 5: Register the provider**

In `opportunities.module.ts`, import and add `OpportunityShareEnrichService` to the `providers` array (alongside `OpportunityShareCardService`).

```ts
import { OpportunityShareEnrichService } from "./opportunity-share-enrich.service";
// ... in @Module({ providers: [ ... OpportunityShareCardService, OpportunityShareEnrichService, ... ] })
```

- [ ] **Step 6: Wire into `ensureShareCard`**

In `opportunities.service.ts`:

1. Add to the constructor params (near line 476, after `aiService`):

```ts
    private readonly shareEnrichService: OpportunityShareEnrichService,
```

2. Add the import (near line 29):

```ts
import { OpportunityShareEnrichService } from "./opportunity-share-enrich.service";
```

3. Replace the body of `ensureShareCard` (lines 930–952) so it enriches first:

```ts
  async ensureShareCard(id: string) {
    const loaded = await this.findOne(id);
    if (!loaded) {
      return null;
    }
    const opportunity = await this.shareEnrichService.ensureEnriched(loaded);

    const shareUrl = buildOpportunityPublicShareUrl(
      id,
      this.getPublicAppBaseUrl(),
    );
    const shareText = buildOpportunityShareText(opportunity, shareUrl);
    const shareCard =
      await this.opportunityShareCardService.ensureShareCardForOpportunity(
        opportunity,
      );

    return {
      opportunityId: id,
      shareCard,
      shareUrl,
      shareText,
    };
  }
```

- [ ] **Step 7: Run tests + typecheck + lint**

Run: `cd ~ && cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest opportunity-share --maxWorkers=2 && npx tsc --noEmit -p tsconfig.json && npm run lint`
Expected: PASS — enrich service specs + share-text specs green; no TS errors; 0 lint warnings.

- [ ] **Step 8: Commit**

```bash
cd ~ && git -C /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder add backend/services/services/api/src/opportunities/opportunity-share-enrich.service.ts backend/services/services/api/src/opportunities/opportunity-share-enrich.service.spec.ts backend/services/services/api/src/opportunities/opportunities.service.ts backend/services/services/api/src/opportunities/opportunities.module.ts backend/services/services/api/src/ai/ai.service.ts backend/services/services/api/src/ai/ai.types.ts
git -C /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder commit -m "feat(share): enrich missing share fields via AI in ensureShareCard"
```

---

### Task 4: OG image resolver never falls to the generic icon (backend)

**Files:**
- Create: `backend/services/services/api/src/opportunities/opportunity-share-image.ts`
- Test: `backend/services/services/api/src/opportunities/opportunity-share-image.spec.ts`
- Modify: `backend/services/services/api/src/opportunities/og.controller.ts` (lines 208–220 image resolution)

**Interfaces:**
- Consumes: an opportunity record + optional freshly-generated card url.
- Produces: `resolveShareImage(opp, opts): { url: string; usingBrandedCard: boolean; needsCard: boolean }` where `opts = { cardUrl?: string; defaultImage: string }`. `needsCard` is true when the only thing that would resolve is a card that does not yet exist — the controller uses it to decide whether to generate one.

- [ ] **Step 1: Write the failing test**

Create `opportunity-share-image.spec.ts`:

```ts
import { describe, expect, it } from "@jest/globals";
import { resolveShareImage } from "./opportunity-share-image";

const DEFAULT = "https://www.edutu.org/icons/icon-512x512.png";

describe("resolveShareImage", () => {
  it("prefers the scraped source flyer", () => {
    const r = resolveShareImage(
      { metadata: { source_image_url: "https://cdn/flyer.jpg" }, image_url: "https://cdn/other.jpg" },
      { defaultImage: DEFAULT },
    );
    expect(r.url).toBe("https://cdn/flyer.jpg");
    expect(r.usingBrandedCard).toBe(false);
    expect(r.needsCard).toBe(false);
  });

  it("falls to image_url then share card", () => {
    const card = resolveShareImage(
      { metadata: { share_card: { url: "https://cdn/card.png" } } },
      { defaultImage: DEFAULT },
    );
    expect(card.url).toBe("https://cdn/card.png");
    expect(card.usingBrandedCard).toBe(true);
  });

  it("uses a freshly generated card url when the opp has no image yet", () => {
    const r = resolveShareImage({ metadata: {} }, { cardUrl: "https://cdn/new-card.png", defaultImage: DEFAULT });
    expect(r.url).toBe("https://cdn/new-card.png");
    expect(r.usingBrandedCard).toBe(true);
  });

  it("signals needsCard (not the icon) when nothing resolves and no card was generated", () => {
    const r = resolveShareImage({ metadata: {} }, { defaultImage: DEFAULT });
    expect(r.needsCard).toBe(true);
    expect(r.url).toBe(DEFAULT); // only as the absolute last resort
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~ && cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest opportunity-share-image --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

Create `opportunity-share-image.ts`:

```ts
type OpportunityRecord = Record<string, any>;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export interface ResolvedShareImage {
  url: string;
  usingBrandedCard: boolean;
  needsCard: boolean;
}

/**
 * Resolve the image a shared opportunity link should unfurl with.
 * Priority: scraped source flyer → opportunity image → existing/just-generated
 * branded card. The generic icon is returned ONLY when nothing else exists and
 * no card could be generated — callers should generate a card when `needsCard`.
 */
export function resolveShareImage(
  opp: OpportunityRecord,
  opts: { cardUrl?: string; defaultImage: string },
): ResolvedShareImage {
  const metadata = asRecord(opp.metadata);
  const sourceImage =
    clean(metadata.source_image_url) ||
    clean(opp.source_image_url || opp.sourceImageUrl);
  const image =
    clean(opp.image_url || opp.imageUrl) ||
    clean(opp.share_image_url || opp.shareImageUrl);
  const existingCard = clean(asRecord(metadata.share_card).url);
  const card = clean(opts.cardUrl) || existingCard;

  const real = sourceImage || image;
  if (real) {
    return { url: real, usingBrandedCard: false, needsCard: false };
  }
  if (card) {
    return { url: card, usingBrandedCard: true, needsCard: false };
  }
  return { url: opts.defaultImage, usingBrandedCard: false, needsCard: true };
}
```

- [ ] **Step 4: Wire into `og.controller.ts`**

Replace the image-resolution block (lines 208–220) with a call that generates a card when needed. Replace:

```ts
    // Image priority: scraped source flyer → opportunity image → cached branded
    // card → generic Edutu icon.
    const sourceImage =
      clean(metadata.source_image_url) ||
      clean(opp.source_image_url || opp.sourceImageUrl);
    const brandedCard = clean(asRecord(metadata.share_card).url);
    const image =
      sourceImage ||
      clean(opp.image_url || opp.imageUrl) ||
      clean(opp.share_image_url || opp.shareImageUrl) ||
      brandedCard ||
      this.defaultImage;
    const usingBrandedCard = Boolean(brandedCard) && image === brandedCard;
```

with:

```ts
    // A shared link must never unfurl with the generic Edutu icon. Prefer the
    // scraped source flyer / opportunity image; otherwise ensure a branded card
    // exists (generating it on demand for never-shared opportunities).
    let resolved = resolveShareImage(opp, { defaultImage: this.defaultImage });
    if (resolved.needsCard) {
      try {
        const ensured = await this.opportunities.ensureShareCard(id);
        resolved = resolveShareImage(opp, {
          cardUrl: ensured?.shareCard?.url,
          defaultImage: this.defaultImage,
        });
      } catch {
        // keep the default-icon last resort
      }
    }
    const image = resolved.url;
    const usingBrandedCard = resolved.usingBrandedCard;
```

Add the import at the top of `og.controller.ts` (after the `buildOpportunityPublicShareUrl` import, line 6):

```ts
import { resolveShareImage } from "./opportunity-share-image";
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd ~ && cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest opportunity-share-image --maxWorkers=2 && npx tsc --noEmit -p tsconfig.json`
Expected: PASS — resolver tests green; no TS errors.

- [ ] **Step 6: Commit**

```bash
cd ~ && git -C /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder add backend/services/services/api/src/opportunities/opportunity-share-image.ts backend/services/services/api/src/opportunities/opportunity-share-image.spec.ts backend/services/services/api/src/opportunities/og.controller.ts
git -C /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder commit -m "fix(og): backend OG never falls to generic icon; generate card on demand"
```

---

### Task 5: Netlify edge OG — resolve from the opportunity first, never icon when a card exists

**Files:**
- Modify: `edutu-web-app/netlify/edge-functions/opportunity-og.ts` (lines 85–128)

**Interfaces:**
- Consumes: backend `GET /opportunities/:id` (fast, CDN-cached, already hoists `source_image_url` + `share_image_url`) and `POST /opportunities/:id/share-card` (slower, generates a card).
- Produces: the same rewritten HTML, but the image resolves without waiting on the share-card POST when the opportunity already carries any image — reducing exposure to Render cold-start timeouts that were dropping links to the generic icon.

**Why:** Today both fetches run in `Promise.all`; if the share-card POST is slow (Render spin-up) the whole handler can time out into the `catch`, which serves the generic icon. Most opportunities already expose `share_image_url` (the hoisted card) from the fast GET, so we should resolve from that first and only await card generation when the opportunity has no image at all.

- [ ] **Step 1: Restructure the fetch + image resolution**

Replace the block from `let html = await response.text();` through the `const image = ...` assignment (lines 83–127) with:

```ts
  let html = await response.text();

  try {
    // Fast path: the opportunity GET is CDN-cached and already hoists the
    // source flyer + previously-generated share card, so it usually carries an
    // image on its own.
    const oppRes = await fetch(`${BACKEND}/opportunities/${encodeURIComponent(id)}`);
    const opp = oppRes.ok ? await oppRes.json() : null;
    if (!opp || !opp.id) {
      return new Response(html, response);
    }

    const sourceImage =
      clean(opp.metadata?.source_image_url) ||
      clean(opp.source_image_url || opp.sourceImageUrl);
    let image =
      sourceImage ||
      clean(opp.image_url || opp.imageUrl) ||
      clean(opp.share_image_url || opp.shareImageUrl);
    let brandedCard = image && image === clean(opp.share_image_url || opp.shareImageUrl) ? image : "";

    // Only when the opportunity has NO image of its own do we pay for card
    // generation — this is exactly the case that used to unfurl as the icon.
    if (!image) {
      try {
        const cardRes = await fetch(
          `${BACKEND}/opportunities/${encodeURIComponent(id)}/share-card`,
          { method: "POST" },
        );
        const card = cardRes.ok ? await cardRes.json() : null;
        brandedCard = clean(card?.shareCard?.url);
        image = brandedCard;
      } catch {
        // fall through to DEFAULT_IMAGE
      }
    }

    if (!image) {
      image = DEFAULT_IMAGE;
    }
    const usingBrandedCard = Boolean(brandedCard) && image === brandedCard;
```

Keep everything from `const title = clean(opp.title) ...` onward, but MOVE the `title`/`description` computation to just after the `if (!opp || !opp.id)` guard (they were previously below the fetch). Ensure `const pageUrl = ...` and the rest of the tag rewriting remain unchanged. Remove the now-deleted `const [oppRes, cardRes] = await Promise.all([...])` and the old `brandedCard`/`sourceImage`/`image` declarations.

- [ ] **Step 2: Typecheck the edge function**

The Netlify edge function is Deno and not covered by jest. Verify it parses and has no obvious type issues by building the web app's type check:

Run: `cd ~ && cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app && npm run typecheck`
Expected: PASS (edge functions are excluded from the app tsconfig; this confirms no accidental app breakage). If edge files are not part of typecheck, visually verify the diff compiles as valid TS/Deno.

- [ ] **Step 3: Manual verification note**

Because this path depends on the live backend + a crawler, record for the user to verify post-deploy:
- `curl -A "WhatsApp/2" https://www.edutu.org/opportunity/<id-with-source-image>` → `og:image` is the source flyer.
- `curl -A "WhatsApp/2" https://www.edutu.org/opportunity/<id-without-any-image>` → `og:image` is the branded card URL (bucket `opportunity-share-cards`), NOT `icon-512x512.png`.

- [ ] **Step 4: Commit**

```bash
cd ~ && git -C /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder add edutu-web-app/netlify/edge-functions/opportunity-og.ts
git -C /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder commit -m "fix(og): web edge resolves image from opportunity first, card fallback never icon"
```

---

### Task 6: Full backend gate + final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full opportunities + ai test suites**

Run: `cd ~ && cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx jest opportunities ai --maxWorkers=2`
Expected: PASS — no regressions in existing opportunity/AI specs.

- [ ] **Step 2: Typecheck + lint the backend**

Run: `cd ~ && cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api && npx tsc --noEmit -p tsconfig.json && npm run lint`
Expected: PASS — no TS errors, 0 lint warnings.

- [ ] **Step 3: Confirm the deploy-order note for the user**

Enrichment writes new `metadata.ai_enriched` + fills `metadata.benefits`/`eligibility`/`summary` — all inside the existing `metadata jsonb`, so **no DB migration is required**. The new AI route `opportunities.share_enrich` uses `DEFAULT_ROUTES` (no `ai_routes` DB row needed; it can be overridden later). Backend deploy is the only requirement; the Netlify edge change ships with the web deploy.

---

## Self-Review

- **Spec coverage:**
  - Part A on-demand enrichment → Tasks 2 + 3. ✅
  - Only-missing / never-overwrite → `mergeShareEnrichment` + `missing*` guards (Task 2), tested. ✅
  - Grounded prompt, blank-over-guess → `buildShareEnrichPrompt` + schema (Task 2), tested. ✅
  - Deadline never fabricated / omit when absent → Task 1 (conditional row), Global Constraints. ✅
  - Caching by source hash → `shareEnrichSourceHash` + `ai_enriched.sourceHash` guard (Tasks 2/3), tested. ✅
  - Eligibility surfaced in share text (was entirely absent) → Task 1 "Who Can Apply". ✅
  - Part B image never generic icon → Tasks 4 (backend) + 5 (edge). ✅
- **Placeholder scan:** No TBD/TODO; every code step has full code. ✅
- **Type consistency:** `missingShareFields`, `shareEnrichSourceHash`, `buildShareEnrichPrompt`, `mergeShareEnrichment`, `ShareEnrichmentSchema` (Task 2) used verbatim in Task 3; `resolveShareImage` signature (Task 4) used verbatim in `og.controller`. `ensureShareCard` return shape `{ shareCard, shareUrl, shareText }` consumed correctly in Task 4. ✅
