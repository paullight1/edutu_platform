# Edutu For You — impact program landing section + `/edutuforyou` page

**Date:** 2026-08-03
**Scope:** `edutu-web-app` only. No backend, no mobile, no database changes.

---

## 1. What we are building

**Edutu For You** is Edutu's impact program: a commitment to reach **one million
underprivileged young people with access to global opportunities, using AI
infrastructure**.

Two deliverables:

1. A **full-bleed section on the public landing page** (`LandingPageV3.tsx`)
   that sells the vision and routes to the program page.
2. A new **`/edutuforyou` page** that tells the whole story — the gap, the aim,
   how it works, composite beneficiary stories, how to partner, how to join.

### Relationship to the existing `/impact` page

`/impact` already exists (990 lines) and is the **research** page — the
opportunity-gap report, downloadable PDF, data and methodology. It stays exactly
as it is.

`/edutuforyou` is the **program** page — mission, stories, partnership, joining.
Different job, different audience, different CTA. The two cross-link:

- `/edutuforyou` → "The research behind this" → `/impact`
- `/impact` → "The program this funds" → `/edutuforyou`

Rejected: folding the program into `/impact` (buries it), and demoting `/impact`
(loses the research page's standalone SEO value).

---

## 2. Audience and lanes

One page, two clearly separated lanes:

| Lane | Sections | Primary CTA |
|---|---|---|
| **Partners / funders** | Hero, The gap, Our aim, The four pillars, Partner band | **Partner with us** → `mailto:my.edutu@gmail.com` |
| **Beneficiaries** | Stories, A year in the program, Join band | **Follow the community** → WhatsApp channel (see §5 for why this wording) |

The transition point is the Stories section: everything above argues *why this
should exist*, everything below speaks to *the person it exists for*.

---

## 3. Program pillars

Confirmed with the user. Note that **free Pro access is deliberately NOT a
pillar** — we do not promise sponsored subscriptions on this page.

1. **AI matching in local context** — surfacing opportunities someone would
   never have found, filtered to what they are actually eligible for.
   Mobile-first, low-bandwidth, multilingual.
2. **Application coaching** — CV tailoring, essay drafting, interview prep: the
   work that normally requires a paid consultant.
3. **Community and mentorship** — peer cohorts and mentor access; the human
   layer around the AI.
4. **Access to global opportunities** — the umbrella promise: no gatekeepers, no
   agent fees, no "who do you know".

---

## 4. Content

### 4.1 Voice

Plain, concrete, unsentimental. The emotional weight comes from specific detail
(a cracked phone screen, a shared data bundle), never from adjectives about how
tragic poverty is. No white-saviour framing: these are capable people missing
*information*, not people missing *ability*.

Headline: **"Talent is everywhere. Access isn't."**

### 4.2 The gap — four stat cards

Every stat is attributed on the card itself. Two classes:

**Externally sourced** (must carry a named source and be verified before ship):

- Africa's population skew — ~70% of sub-Saharan Africa is under 30
  (UN DESA, World Population Prospects).
- Youth unemployment / underemployment in sub-Saharan Africa (ILO).

**Edutu-owned** (computed from our own data, attributed to us):

- Count of live, fully-funded opportunities Edutu tracks, updated daily.
- Share of tracked opportunities that close within 30 days of first discovery —
  the "you found it too late" number, which is the actual thesis of the program.

**Rule: any figure we cannot source gets cut, not softened.** The implementation
plan must include a step where the two external figures are confirmed against a
live source and the two Edutu figures are computed; placeholder numbers must not
reach production.

### 4.3 Our aim — the milestone ladder

The 1,000,000 figure is presented as a staged plan, not a slogan:

| Phase | Reach | Horizon |
|---|---|---|
| Phase 1 — Prove | 10,000 | 2026 |
| Phase 2 — Scale | 100,000 | 2027 |
| Phase 3 — Reach | 1,000,000 | 2030 |

Horizons are the design's proposal and are confirmed by the user before ship.

### 4.4 Stories — three composite personas

Presented as vivid, emotionally true narratives. **Each card carries a visible
`Illustrative composite` tag**, and the section opens with one honest line:

> These portray the young people Edutu For You is built for — composites drawn
> from our user research, not alumni we have served.

This is non-negotiable. An impact page is trust-critical; an unlabelled fictional
testimonial is the single fastest way to lose a funder or a journalist.

1. **Amara, 19 — Kano, Nigeria.** Teaching herself Python on a phone with a
   cracked screen. Finds a fully-funded fellowship she had never heard of. The
   barrier was never the coursework; it was a CV she had no idea how to write.
   (Amara is already the persona name used in Edutu's user-testing research —
   reusing it keeps our internal and external language consistent.)
2. **Kwame, 23 — Kumasi, Ghana.** Graduated top of his class into three years of
   "we regret to inform you". His problem was applying to the wrong forty things
   instead of the right four.
3. **Halima, 17 — Kakuma, Kenya.** A refugee settlement and a shared data
   bundle. For her, low-bandwidth mobile access is not a feature of the product,
   it *is* the product.

Each card: portrait, pull-quote, two-line teaser, and a **Read more** that
expands the full story **inline** (accordion). We are already on the destination
page, so a second navigation would be friction with no payoff.

### 4.5 A year in the program

A horizontal timeline strip: Month 1 profile and first matches → Months 2–3
first application kit → Months 4–6 first submissions → Months 7–9 mentorship and
iteration → Months 10–12 outcomes and paying it forward.

### 4.6 Partner band

Four partnership lanes, so a prospective partner can self-identify:

- **Funding partners** — underwrite cohorts.
- **Distribution partners** — NGOs, schools, youth organisations who reach the
  young people we cannot.
- **Opportunity partners** — universities and foundations who want their
  programs in front of applicants who currently never see them.
- **Mentor partners** — professionals giving hours, not money.

CTA: `mailto:my.edutu@gmail.com` with a prefilled subject
(`Partnering with Edutu For You`).

### 4.7 Join band

Who it is for, what you get (the four pillars restated in second person), and
three concrete steps to join. CTA points at the WhatsApp channel.

### 4.8 FAQ

Four to six short entries, including the two uncomfortable ones: *Is this free?*
and *Are these real people?* Answering those in our own words is cheaper than
having someone else ask them.

---

## 5. Links

Both defined once in `src/lib/edutuForYou.ts` and imported by both consumers.

- `WHATSAPP_JOIN_URL = "https://whatsapp.com/channel/0029VbCHBEVJJhzPcbBboP3y"`
  — reused from the existing mobile "Discussion" community link
  (`edutumobile/app/(app)/opportunities/index.tsx:103`).
  **Known limitation:** this is a WhatsApp *channel*, which is broadcast-only —
  followers cannot post. Button copy is therefore **"Follow the community"**,
  not "Join the conversation", so the label matches what the destination
  actually does. If a group invite link is supplied later, this is a one-line
  swap and the copy can strengthen.
- `PARTNER_EMAIL = "my.edutu@gmail.com"`, surfaced as a `mailto:` with a
  prefilled subject.

---

## 6. Architecture

### 6.1 New files

| File | Purpose |
|---|---|
| `src/lib/edutuForYou.ts` | Single source of truth: links, pillars, stats, personas, milestones, timeline, FAQ — all typed consts. No JSX. |
| `src/components/EdutuForYouBand.tsx` | The landing-page section. Self-contained; `LandingPageV3` mounts it with one line. |
| `src/components/EdutuForYouPage.tsx` | The `/edutuforyou` page. |
| `src/components/edutu-for-you/StoryCard.tsx` | The composite-persona card with its inline expand. Extracted because it owns state; everything else on the page is static. |

Content lives in `edutuForYou.ts` so copy, stats and stories can be edited
without touching JSX — the same pattern `ImpactPage.tsx` already uses. It also
means the landing band and the page cannot drift out of sync on the numbers.

`EdutuForYouPage.tsx` composes section components defined in the same file where
they are single-use and short; anything that owns state or exceeds ~80 lines
moves to `src/components/edutu-for-you/`. The page file must not exceed ~600
lines — if it does, sections get extracted.

### 6.2 Files modified

| File | Change |
|---|---|
| `src/App.tsx` | Lazy route `/edutuforyou` → `EdutuForYouPage`, matching the existing lazy-route pattern. |
| `src/components/LandingPageV3.tsx` | Mount `<EdutuForYouBand />` between the community/proof block and the FAQ section. |
| `src/components/SiteFooter.tsx` | Nav entry under the company/about column. |
| `src/components/PublicSiteMenu.tsx` | Nav entry. |
| `src/components/ImpactPage.tsx` | One cross-link to `/edutuforyou`. |
| `scripts/page-seo.mjs` | New `PAGE_SEO` entry (`path: "/edutuforyou"`, `slug: "edutu-for-you"`). |
| `scripts/generate-sitemap.mjs` | Add `/edutuforyou` to the static URL list. |

### 6.3 SEO / Open Graph

`scripts/page-seo.mjs` is the single source of truth feeding three consumers:
OG image capture, post-build route-meta injection for non-JS crawlers, and the
codegenned `src/lib/pageSeo.generated.ts` that the runtime `<Seo>` reads. Adding
one entry there covers all three. `src/lib/pageSeo.generated.ts` is generated —
never hand-edited.

`settleMs` must be set high enough (~2500ms, matching the `/` entry) that the
hero's motion and images have settled before the OG screenshot is captured.

Note that OG image capture (`npm run seo:og`) is **not** part of `prebuild` — it
is a separate manual step. Generating `public/og/edutu-for-you.jpg` and
committing it is therefore an explicit task in the implementation plan; skipping
it leaves the page unfurling with a missing image.

**Pre-existing gap, noted not fixed:** `generate-sitemap.mjs` currently omits
every marketing page (`/about`, `/impact`, `/community`, …) — it lists only `/`,
`/opportunities`, `/events` and dynamic detail routes. We add `/edutuforyou`
only. Backfilling the other marketing routes is worth doing but is out of scope
here.

### 6.4 Styling

- Theme tokens only: `bg-surface-*`, `text-text-*`, `border-subtle`,
  `text-brand`. **Never `text-primary`** — it is not a token in this system.
- The landing band deliberately breaks the page's light editorial rhythm by
  going dark full-bleed, so the program reads as an institution rather than
  another product feature.
- `framer-motion` with the `fadeUp` / `staggerContainer` variants copied from
  `ImpactPage.tsx`, and `useReducedMotion` respected on every animated element
  including the count-up.
- Fully responsive; the portrait mosaic collapses to a single row on mobile.

### 6.5 Images

Hotlinked Unsplash / Pexels, matching the convention already established in
`AboutPage`, `CommunityPage` and `CommunityShowcase`. No CSP blocks this.

**Sourcing rule:** photo IDs recalled from memory 404 silently and ship as
broken images. Therefore:

1. Prefer IDs **already proven working in this codebase**
   (`CommunityPage.tsx`, `CommunityShowcase.tsx`, `AboutPage.tsx`).
2. Any new ID must be verified to return HTTP 200 before it is committed.
3. Every image is wrapped in `ImageWithFallback`.

Subject matter: young African people studying, working, in classrooms and
community settings — dignified and active, never pitiable. Portraits carry
descriptive `alt` text.

---

## 7. Testing

Vitest, matching the existing web test setup (Clerk mocks must use
`vi.hoisted`). Web CI gates Lint, TypeCheck and Tests, so all three must pass.

1. `EdutuForYouPage` renders without crashing and shows the headline.
2. The partner CTA has an `href` of `mailto:my.edutu@gmail.com` with the
   prefilled subject.
3. The join CTA has the exact `WHATSAPP_JOIN_URL` `href`, plus
   `target="_blank"` and `rel="noopener noreferrer"`.
4. Each story card renders the `Illustrative composite` label.
5. Clicking **Read more** on a story reveals its full text; clicking again
   collapses it.
6. `EdutuForYouBand` renders on the landing page and links to `/edutuforyou`.

Manual verification before completion: `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`, and a browser pass at 375px, 768px and 1440px
confirming no horizontal overflow and no broken images.

---

## 8. Out of scope

- Any backend, database or mobile change.
- i18n — these marketing pages are hard-coded English today (`ImpactPage`,
  `AboutPage`); we stay consistent rather than introducing a lone translated
  page.
- A real donation or payment flow. Partnering is an email conversation.
- Backfilling the other marketing routes into the sitemap.
- Any claim of free Pro access.
