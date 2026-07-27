---
target: edutu-web-app landing page
total_score: 25
p0_count: 0
p1_count: 4
timestamp: 2026-07-25T10-55-12Z
slug: edutu-web-app-src-components-landingpagev3-tsx
---
⚠️ DEGRADED: single-context (project instruction forbids the Agent tool; no browser automation exposed)

Target: `edutu-web-app/src/components/LandingPageV3.tsx` (route `/`), register **brand**.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | `useOpportunities()` exposes `loading`, but the page destructures only `data` — cold-cache visitors get the "Fresh opportunities" heading over an empty grid |
| 2 | Match System / Real World | 3 | "31 Countries" (hero section + FAQ) contradicts "80+ countries" in the About feature card |
| 3 | User Control and Freedom | 3 | Hero word rotates forever with no pause; two infinite marquees can't be stopped |
| 4 | Consistency and Standards | 2 | Four different section-heading sizes, two card radii (22px vs 32px), two body sizes across sections |
| 5 | Error Prevention | 3 | Nothing destructive; logo `onError` text fallback is a good touch |
| 6 | Recognition Rather Than Recall | 3 | CTAs and nav are labelled and plain-spoken |
| 7 | Flexibility and Efficiency | 2 | No way to sample the product without signing up; no pause affordance on any looping motion |
| 8 | Aesthetic and Minimalist Design | 2 | Ten sections, four of them proof/vanity, product never shown once |
| 9 | Error Recovery | 2 | Blog fetch failure silently substitutes three fabricated articles with invented authors |
| 10 | Help and Documentation | 3 | FAQ is genuinely useful and well-placed |
| **Total** | | **25/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**Deterministic scan**: `detect.mjs` on `LandingPageV3.tsx` returned `[]` — clean, exit 0. Verified the detector is functional by running it across `src/components`, where it flagged a `border-left: 3px` side-tab in `BlogPostPage.tsx:104` and violet-gradient palette hits in `ImageWithFallback.tsx:43` and `OpportunitiesPage.tsx`. So the landing page genuinely avoids the syntactic tells: no gradient text, no side-stripes, no glassmorphism-by-default, no violet-cyan AI palette.

**Visual overlays**: not available. No browser automation tool is exposed in this session, so no live server was started and no overlay was injected. Everything below is from source reading plus computed contrast ratios.

**LLM assessment**: the failures here are *compositional*, not syntactic — which is why the scanner missed them.

1. **Eyebrow-on-every-section is the loudest tell.** `SectionEyebrow` fires eight times: Latest Opportunities · Global Reach · Our Impact · Top Institutions · About · From the Blog · Testimonials · FAQ. All `text-xs uppercase tracking-[0.2em] text-brand`. One named kicker is brand voice; eight is AI grammar, and it's an explicit absolute ban.
2. **Two structurally identical 3-up image-card grids.** The opportunity cards (L326–365) and blog cards (L575–604) are the same component in different clothes: `rounded-[22px] border border-subtle bg-surface-layer`, ~210/220px cover image, gradient scrim, category label, title, `whileHover y:-3`. A reader hits the same shape twice and the page flattens.
3. **The page never shows the product.** Hero is a gradient field, two buttons, and a rotating word. Below it: stock photos of strangers, flag tiles, university logos, more stock photos. There is not one screenshot, one UI fragment, one match-card, one deadline view. For a brand-register surface, zero product imagery is the failure mode, not restraint.
4. **The rotating hero word** (`Programs → Scholarships → Internships → Fellowships`, 2.4s, forever) is a saturated SaaS trope, and it's the first thing the eye locks onto — competing with the CTA for the entire time the visitor is on the fold.

## Overall Impression

The bones are better than the page. Tokens are disciplined, contrast is mostly deliberate, `useReducedMotion` is threaded through every Framer block, images are lazy + async-decoded, the logo fallback is thoughtful. Someone cared.

But the page is arranged as a **trust-signal parade instead of an argument**. Nine sections of proof — countries, institutions, impact, blog, testimonials — surround a product the visitor never actually sees. The single explanation of what Edutu *does* (the four About cards) lands 6th, roughly 60% down the scroll. A first-timer reads "Your AI guide to global Scholarships", scrolls past 16 flags and 18 university crests, and still cannot picture the app.

**Biggest opportunity**: cut the proof sections roughly in half and spend the reclaimed space showing the product doing its job — one real match card, one real deadline view, one real tailored application. Trust for this audience comes from *seeing a real opportunity with a real deadline*, not from a Harvard crest.

## What's Working

- **Token discipline.** Nearly everything routes through `bg-surface-*` / `text-text-*` / `border-subtle` / `text-brand`. Dark mode is a genuine second design, not an inversion — `.dark .landing-hero` swaps in a photo-backed navy field and drops `--mesh-opacity` to 0.06 so the hero goes near-solid instead of muddy. That's a real decision.
- **Reduced-motion is threaded seriously.** Every `motion` block reads `useReducedMotion()`, and `index.css:1157` adds a global belt-and-braces kill for CSS animations — which correctly stops the marquees, since a stylesheet `!important` beats the inline `style={{animation}}`.
- **Light-mode contrast holds up.** `--text-muted` (#64748B) on white computes to **4.76:1** and `text-brand` (#2563EB) to **5.17:1** — both clear AA, including the 11–12px meta text. That's better than most landing pages.

## Priority Issues

### [P1] Dark-mode `--text-muted` fails WCAG AA
`--text-muted: 100 116 139` (#64748B) on the dark card surface `--surface-layer: 20 25 38` computes to **3.69:1**; on `--surface-body` (#0C0F1A) it's **4.02:1**. Both under the 4.5:1 floor. It carries the opportunity deadline (L356), the entire blog byline row — author, date, read time at 12px (L597) — and the testimonial role line (L643).

**Why it matters**: the deadline is the single most decision-relevant fact on an opportunity card, and it's the least legible text in dark mode. On a mid-range Android in daylight it disappears.
**Fix**: lift dark `--text-muted` from `100 116 139` to ~`148 163 184` (#94A3B8 → 6.8:1 on cards). Light mode is unaffected, and the whole app benefits.
**Suggested command**: `/impeccable audit`

### [P1] "Our Impact" promises proof and delivers none
The section (L436–460) reads *"Here's the proof — and the stories behind every number"* and then contains a heading, a paragraph, and a button. Zero numbers. It's a link styled as a section. Worse, it uses a **filled brand button** — identical weight to "Get started free" — so the page's second-strongest visual CTA sends people *away* from signup. And the destination's stats are placeholder constants.

**Why it matters**: for an audience your own research says is scanning for scam signals, "here's the proof" followed by nothing is the exact shape of a page that has nothing.
**Fix**: either put three real numbers in the section, or delete it and fold the link into the footer. If it stays, demote the button to the outline treatment used by "Read the blog".
**Suggested command**: `/impeccable clarify`

### [P1] No loading state — cold visitors see an empty grid under a live heading
`const { data: opportunities } = useOpportunities()` (L170) drops the hook's `loading` flag. `useOpportunities.ts` seeds `loading: !cached`, so a first-time visitor renders "Fresh opportunities worth exploring" + subcopy + **nothing**, then a pop-in. If the API is down, the empty grid is permanent with no message.

**Why it matters**: the first proof point on the page is a blank space, for exactly the slow-connection users you're targeting.
**Fix**: destructure `loading`, render three skeleton cards at the card's real dimensions, and give the fetch-failed case a one-line "Opportunities are loading — browse the full list" fallback linking to `/opportunities`.
**Suggested command**: `/impeccable harden`

### [P1] Eight uppercase eyebrows + two identical card grids
Covered in the verdict above. The eyebrow repetition and the opportunity/blog card duplication are the two reasons the page reads templated despite a clean detector run.

**Fix**: keep at most one kicker as a deliberate brand device (or drop them entirely and let the heading scale carry hierarchy). Re-cut one of the two card grids into a different affordance — the opportunities work far better as a horizontal rail or a dense list with deadline chips, which also *shows the product's actual density* rather than three magazine tiles.
**Suggested command**: `/impeccable layout`

### [P2] Reduced-motion users still get text swapping every 2.4 seconds
The `setInterval` at L204–209 has no `reduceMotion` guard. With reduced motion on, the Framer variants become `undefined`, so `AnimatePresence` still swaps the word — just *instantly*, with no transition, forever. That's arguably worse than the animation: a hard content jump in the h1 every 2.4s.

**Why it matters**: users who set that preference often set it for vestibular or attention reasons. An un-animated hard cut is precisely what they asked not to receive.
**Fix**: `if (reduceMotion) return;` at the top of the effect, and render a fixed word (or the plural "Opportunities"). Consider stopping the rotation after one full cycle regardless — a loop that never ends keeps pulling focus off the CTA.
**Suggested command**: `/impeccable animate`

### [P2] Typography has no contrast axis, and a font nobody uses is render-blocking
`tailwind.config.js:62–64` sets `display`, `body`, **and** `sans` all to **Outfit** — so `font-display` and `font-body` are the same typeface at the same weights. There is no typographic contrast in the system, only size. Outfit is also a training-data default.

Separately, `index.html:120` render-blocks a Google Fonts stylesheet for **Inter**, which is referenced nowhere in `index.css` or `tailwind.config.js` — grep returns zero hits. It's a blocking request on the LCP path for a font that never paints.

**Why it matters**: the wasted stylesheet directly costs first paint on the slow connections your users are on; the single-family system is why headings read as "big body text".
**Fix**: delete the Inter `<link>`. Then pick a contrast axis for display — a humanist or grotesk with real character against Outfit's geometric body, or commit to Outfit alone with a much harder weight jump (400 body / 800 display) so the hierarchy is intentional rather than incidental.
**Suggested command**: `/impeccable typeset`

### [P2] 18 hotlinked university crests imply a partnership that doesn't exist
`institutions` (L76–95) hotlinks 18 trademarked logos from `commons.wikimedia.org/wiki/Special:FilePath/...`. I verified five: all return **200** (via redirect to `upload.wikimedia.org`), so they do render. The problems are elsewhere: the heading says *"Partner with leading institutions"* directly under a Harvard/MIT/Stanford wall, which reads as endorsement; that's 18 cross-origin requests, each a redirect hop, to a host with no `preconnect` in `index.html` (only Pexels gets `dns-prefetch`); and Wikimedia's user-agent policy discourages exactly this hotlinking pattern.

**Why it matters**: legitimacy is the moat for this product. A misread partnership claim is the one trust failure you can't afford, and it's the easiest to fix.
**Fix**: reword to something unambiguous — "Opportunities sourced from institutions like…" — and self-host the SVGs so first paint isn't waiting on 18 Wikimedia redirects.
**Suggested command**: `/impeccable clarify`

## Persona Red Flags

**Jordan (First-Timer)**: Reads the h1 and cannot tell whether Edutu is a job board, a newsletter, or an AI chatbot — "guide" is doing a lot of unearned work. Scrolls through flags, crests, and stock photos before reaching the four About cards ~60% down, which are the *only* explanation of what the product does. Never sees the interface. The FAQ answers the questions the page should have answered visually 8 sections earlier.

**Riley (Stress Tester)**: Kills the network → "Latest Opportunities" is a heading over a void, permanently, no message. Blocks the blog API → three articles appear with authors "Paul Adeyemi", "Sarah Chen", "James Okafor" and May-2026 dates, all linking to `/blog` with no slug, because `landingBlogArticles` is a hardcoded fallback. Notices the three testimonials are all Nigeria, all exactly 5 stars, all Pexels stock avatars. Notices "31 Countries" and "80+ countries" on the same page. Concludes the numbers are decorative.

**Casey (Distracted Mobile)**: On mobile, `.landing-hero` is forced to `min-height: 100dvh !important` with `padding-top: 0 !important` (`index.css:1104`) while `PublicHeader` is `fixed` — the fold has to hold h1 + copy + two stacked full-width buttons under an overlapping header, which is tight on a 667px viewport. Two 30s infinite marquees render 64 `<img>` elements and animate continuously — battery and CPU on the exact mid-range Android you target. `loading="lazy"` on marquee duplicates that are translated into view is unreliable, so they may pop in mid-slide.

**Amara (project persona — 19, Lagos, mid-range Android, metered data)**: Lands on a page that spends its first three screens proving global reach and its last three proving popularity, and never once shows her a real scholarship with a real deadline and whether she qualifies. The one thing that would convert her — "here is an opportunity you could actually win, closing in 12 days" — is the thing the page has and doesn't lead with.

## Minor Observations

- **Heading scale is inconsistent across sections**: `text-[34px]/sm:[42px]` (Opportunities), `text-[34px]/sm:[44px]` (Impact), `text-[48px]/sm:[56px]` (Countries, Institutions, About, Blog, Testimonials, FAQ). Body copy alternates 18px and 20px with no rule. Pick two heading steps and one body size.
- **Two card radii**: `rounded-[22px]` on opportunity/blog cards vs `rounded-2xl` on feature/testimonial cards — and your Tailwind config overrides `2xl` to **2rem/32px**, so that's a visible 10px difference between adjacent sections. Buttons use `rounded-xl` = **24px** on a ~56px-tall button, which is nearly a pill.
- **Mobile letter-spacing floor breached**: `.landing-hero-title` sets `-0.06em` at `index.css:1113`, past the -0.04em floor; at `line-height: 0.95` the descenders and the next line will nearly touch.
- **Star ratings are unlabelled literal `★` characters** (L626–628) in a bare `<span>` — a screen reader announces "black star" five times per testimonial. Wrap in `role="img"` with `aria-label="5 out of 5"`.
- **FAQ buttons have `aria-expanded` but no `aria-controls`** and the panel has no `id`, so the relationship isn't exposed.
- **Dead code**: `.landing-mesh-stage` / `.landing-mesh-bg` (`index.css:958–970`) appear unused by this page; the injected `<style>` at L414 contains an empty `@media (prefers-reduced-motion: reduce) { .landing-hero { } }` block; `heroBackdropImages` is named for a hero that has no image and is only used as a card fallback.
- **The `<style>` block lives inside a section** (L414–432) rather than `index.css`, so marquee keyframes and the fade gradients re-inject on every render of that subtree.
- **Only one signup CTA in ten sections.** "Get started free" appears in the hero and never again — the page ends on "Join community". There's no closing ask after the FAQ, which is exactly where a convinced reader is ready to act.

## Questions to Consider

- What if the hero showed the product instead of describing it — one real match card, real title, real deadline, real fit tier, live from the same feed the Opportunities section already queries?
- The page has 16 flags, 18 university crests, and 3 testimonials. Which single one of those would you keep if you could only keep one, and what could the other two slots become?
- Your own design system says fit is expressed as **tiers, not percentages**, because a percentage reads as win-odds. The landing page never expresses fit at all. What would it look like to make "we tell you whether you can actually win this" the headline argument instead of "we have opportunities from 31 countries"?
- If a visitor read only the h1 and the first button, would they know this is an app they install — or a list they browse?
