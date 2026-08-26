import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [main, gate, blogPage, opportunitiesPage] = await Promise.all([
  readFile(new URL("../edutu-web-app/src/main.tsx", import.meta.url), "utf8"),
  readFile(
    new URL(
      "../edutu-web-app/src/components/PublicRouteGate.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL("../edutu-web-app/src/components/BlogPage.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../edutu-web-app/src/components/PublicOpportunitiesArchivePage.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
]);

test("public opportunity archives bypass personalized app routing", () => {
  assert.match(main, /PublicRouteGate/);
  assert.match(main, /<PublicRouteGate\s*\/>/);
  assert.match(gate, /PublicOpportunitiesArchivePage/);
  assert.match(gate, /\/opportunities/);
});

test("canonical opportunity category URLs hydrate with matching filters", () => {
  assert.match(opportunitiesPage, /useLocation/);
  assert.match(opportunitiesPage, /matchPath/);
  assert.match(opportunitiesPage, /buildPageHref/);
  assert.match(opportunitiesPage, /getPageHref=\{getPageHref\}/);
  assert.match(opportunitiesPage, /page > 1/);
  assert.match(opportunitiesPage, /\/opportunities\/\$\{category\.slug\}/);
});

test("blog pagination remains addressable after React hydration", () => {
  assert.match(blogPage, /useSearchParams/);
  assert.match(blogPage, /fetchAllPublishedPosts/);
  assert.match(blogPage, /getPageHref=\{getPageHref\}/);
  assert.match(blogPage, /`\/blog\?page=\$\{page\}`/);
});
