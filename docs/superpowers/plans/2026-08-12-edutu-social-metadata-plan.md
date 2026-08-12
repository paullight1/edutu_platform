# Edutu Social Metadata and Route Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make shared Edutu links use the homepage or route-specific hero screenshot as their social preview, with consistent canonical and Open Graph metadata across static, prerendered, and hydrated HTML.

**Architecture:** Keep `scripts/page-seo.mjs` as the source registry and use its generated TypeScript output for runtime image metadata constants. Update the static `index.html` shell, hydrated `Seo.tsx`, and existing post-build route injector so all three metadata consumers emit the same absolute URLs and image dimensions. Dynamic opportunity/blog-detail previews remain backend-owned.

**Tech Stack:** Vite, React 18, TypeScript, Vitest, Playwright-based screenshot generation, Node ESM build scripts, Vercel static rewrites.

## Global Constraints

- The site URL is `https://www.edutu.org`.
- Open Graph assets are JPEG screenshots captured at `1200x630` logical pixels and written as `public/og/<slug>.jpg`.
- The square Edutu icon remains a favicon/PWA asset, not the registered route social image.
- Dynamic `/opportunity/:id`, `/share/opportunity/:id`, and `/blog/:slug` previews remain backend-generated.
- Do not modify unrelated apps or existing uncommitted billing changes.
- Do not hand-edit `src/lib/pageSeo.generated.ts`; regenerate it from `scripts/page-seo.mjs`.

---

### Task 1: Lock the social metadata contract with focused tests

**Files:**
- Modify: `edutu-web-app/src/test/__tests__/pageSeo.test.ts`
- Create: `edutu-web-app/src/test/__tests__/Seo.test.tsx`
- Create: `edutu-web-app/src/test/__tests__/staticSeoShell.test.ts`

**Interfaces:**
- Consumes: `PAGE_SEO`, `findPageSeo`, and `Seo`.
- Produces: tests proving the homepage shell, route registry, and hydrated tags use screenshot previews and canonical URLs.

- [ ] **Step 1: Add generated OG metadata constants to the registry test imports**

Update the generated-registry import in `pageSeo.test.ts` to include `OG_METADATA`, then add this assertion:

```ts
it("uses the canonical screenshot dimensions", () => {
  expect(OG_METADATA).toEqual({
    width: 1200,
    height: 630,
    mimeType: "image/jpeg",
  });
});
```

- [ ] **Step 2: Add the failing hydrated metadata test**

Create `Seo.test.tsx` using Testing Library and `waitFor`. Render:

```tsx
<Seo
  title="Edutu home"
  description="Find global opportunities with Edutu."
  path="/"
/>
```

Then assert that `document.head` contains:

```ts
expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
  "href",
  "https://www.edutu.org/",
);
expect(document.querySelector('meta[property="og:image"]')).toHaveAttribute(
  "content",
  "https://www.edutu.org/og/home.jpg",
);
expect(document.querySelector('meta[property="og:image:secure_url"]')).toHaveAttribute(
  "content",
  "https://www.edutu.org/og/home.jpg",
);
expect(document.querySelector('meta[property="og:image:type"]')).toHaveAttribute(
  "content",
  "image/jpeg",
);
expect(document.querySelector('meta[property="og:image:width"]')).toHaveAttribute(
  "content",
  "1200",
);
expect(document.querySelector('meta[property="og:image:height"]')).toHaveAttribute(
  "content",
  "630",
);
```

- [ ] **Step 3: Add the failing static-shell test**

Create `staticSeoShell.test.ts` that reads `edutu-web-app/index.html` and asserts the root shell contains exactly the homepage preview URLs:

```ts
expect(shell).toContain('property="og:url" content="https://www.edutu.org/"');
expect(shell).toContain('property="og:image"\n      content="https://www.edutu.org/og/home.jpg"');
expect(shell).toContain('name="twitter:image"\n      content="https://www.edutu.org/og/home.jpg"');
expect(shell).not.toContain('property="og:image"\n      content="https://www.edutu.org/icons/icon-512x512.png"');
```

- [ ] **Step 4: Run the focused tests and confirm the new contract fails before implementation**

Run:

```bash
cd edutu-web-app && npm test -- --run src/test/__tests__/pageSeo.test.ts src/test/__tests__/Seo.test.tsx src/test/__tests__/staticSeoShell.test.ts
```

Expected: the new constants, hydrated image metadata, and static shell assertions fail because the implementation has not been updated.

---

### Task 2: Share OG dimensions from the source registry and update hydrated metadata

**Files:**
- Modify: `edutu-web-app/scripts/gen-page-seo-ts.mjs`
- Modify: `edutu-web-app/src/components/Seo.tsx`
- Regenerate: `edutu-web-app/src/lib/pageSeo.generated.ts`

**Interfaces:**
- Consumes: `OG_WIDTH`, `OG_HEIGHT`, and `OG_MIME` from `scripts/page-seo.mjs`.
- Produces: `OG_METADATA` in generated TypeScript and a `Seo` effect that emits complete route image metadata.

- [ ] **Step 1: Extend the code generator imports and output**

Import `OG_WIDTH`, `OG_HEIGHT`, and `OG_MIME` from `page-seo.mjs`. Emit this before `PAGE_SEO`:

```ts
export const OG_METADATA = {
  width: 1200,
  height: 630,
  mimeType: "image/jpeg",
} as const;
```

Use the imported values in the generated template so the TypeScript runtime cannot drift from the screenshot generator.

- [ ] **Step 2: Regenerate the checked-in TypeScript registry**

Run:

```bash
cd edutu-web-app && npm run seo:pages
```

Expected: `src/lib/pageSeo.generated.ts` contains `OG_METADATA` and preserves the existing route entries and descriptions.

- [ ] **Step 3: Emit complete hydrated image metadata**

Import `OG_METADATA` in `Seo.tsx` and, alongside the existing `og:image` upsert, add:

```ts
upsertMeta("property", "og:image:secure_url", imageUrl);
upsertMeta("property", "og:image:type", OG_METADATA.mimeType);
upsertMeta("property", "og:image:width", String(OG_METADATA.width));
upsertMeta("property", "og:image:height", String(OG_METADATA.height));
```

Leave the existing per-item image precedence and dynamic-route behavior unchanged.

- [ ] **Step 4: Run the focused tests and confirm the hydrated contract passes**

Run:

```bash
cd edutu-web-app && npm test -- --run src/test/__tests__/pageSeo.test.ts src/test/__tests__/Seo.test.tsx src/test/__tests__/staticSeoShell.test.ts
```

Expected: the registry and hydrated metadata tests pass; only the static-shell test remains red until Task 3.

---

### Task 3: Replace the root social fallback with the homepage hero screenshot

**Files:**
- Modify: `edutu-web-app/index.html`

**Interfaces:**
- Consumes: the existing homepage registry entry and checked-in `public/og/home.jpg` asset.
- Produces: crawler-visible homepage metadata before JavaScript or post-build route injection runs.

- [ ] **Step 1: Replace the root OG image URLs**

Change both root social image values from `/icons/icon-512x512.png` to the absolute homepage screenshot:

```html
content="https://www.edutu.org/og/home.jpg"
```

Keep the icon URL for favicon, PWA, and publisher-logo uses.

- [ ] **Step 2: Add root image dimensions and secure URL metadata**

Add these tags next to the root `og:image` tag:

```html
<meta property="og:image:secure_url" content="https://www.edutu.org/og/home.jpg" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
```

Update both image alt values from `Edutu logo` to `Edutu homepage — AI-powered global opportunities`.

- [ ] **Step 3: Run the static shell test**

Run:

```bash
cd edutu-web-app && npm test -- --run src/test/__tests__/staticSeoShell.test.ts
```

Expected: PASS, with no generic logo URL remaining in the root OG/Twitter image tags.

---

### Task 4: Verify prerendered route output and the production build

**Files:**
- Inspect: `edutu-web-app/scripts/inject-route-meta.mjs`
- Inspect: `edutu-web-app/vercel.json`
- Inspect generated: `edutu-web-app/dist/index.html`, `edutu-web-app/dist/blog/index.html`

**Interfaces:**
- Consumes: the updated root shell, generated registry constants, and existing route injector.
- Produces: build output with route-specific canonical URLs and screenshots for crawlers.

- [ ] **Step 1: Run the full focused SEO test file**

Run:

```bash
cd edutu-web-app && npm test -- --run src/test/__tests__/pageSeo.test.ts src/test/__tests__/Seo.test.tsx src/test/__tests__/staticSeoShell.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck and lint**

Run:

```bash
cd edutu-web-app && npm run typecheck && npm run lint
```

Expected: both commands exit 0 with no new errors.

- [ ] **Step 3: Run the production build**

Run:

```bash
cd edutu-web-app && npm run build
```

Expected: the build regenerates the sitemap/page registry, injects route metadata, and creates `dist/<registered-route>/index.html` files without reporting missing Vercel rewrites.

- [ ] **Step 4: Inspect representative generated HTML**

Run:

```bash
cd edutu-web-app && rg -n "og:image|og:image:secure_url|og:image:type|og:image:width|og:image:height|canonical|edutu-prerendered" dist/index.html dist/blog/index.html
```

Expected:

- `dist/index.html` uses `https://www.edutu.org/og/home.jpg` and canonical `https://www.edutu.org/`.
- `dist/blog/index.html` uses `https://www.edutu.org/og/blog.jpg` and canonical `https://www.edutu.org/blog`.
- Both contain one value per metadata key and an `edutu-prerendered` marker.

- [ ] **Step 5: Verify checked-in screenshots**

Run:

```bash
cd edutu-web-app && file public/og/home.jpg public/og/opportunities.jpg public/og/blog.jpg
```

Expected: all are JPEGs at `2400x1260`, representing 2x captures of the `1200x630` social card. Do not regenerate live screenshots unless a visual change is required; the existing captures already show the homepage and representative sections.

- [ ] **Step 6: Review the final diff for unrelated changes**

Run:

```bash
git diff --check
git status --short
```

Expected: only the planned web-app metadata/test/generated files are changed in addition to the already-existing user worktree changes; do not stage or revert unrelated modifications.
